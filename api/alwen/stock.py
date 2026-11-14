from datetime import date, datetime, time, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from alwen.audit import write_audit
from alwen.auth import require_roles
from alwen.database import get_db
from alwen.models import (
    DeliveryStatus,
    GoodsReceipt,
    GoodsReceiptLine,
    Item,
    Project,
    PurchaseOrder,
    PurchaseOrderLine,
    StockBalance,
    StockMovement,
    StockMovementType,
    Staff,
    Store,
    User,
    utc_now,
)
from alwen.schemas import (
    GoodsReceiptInput,
    StockAdjustmentInput,
    StockIssueInput,
    StockReturnInput,
    StockTransferInput,
)
from alwen.time_utils import BUSINESS_TIMEZONE


router = APIRouter(tags=["stock"])
MONEY_QUANTUM = Decimal("0.01")
RECEIVE_ROLES = ("Admin", "Procurement Officer", "Store Keeper")
STORE_ROLES = ("Admin", "Store Keeper")
ADJUST_ROLES = ("Admin", "Approver")


def _movement_time(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=BUSINESS_TIMEZONE).astimezone(timezone.utc)


def _audit(db: Session, user: User, action: str, entity_type: str, entity_id: int, after: dict) -> None:
    write_audit(db, user, action, entity_type, entity_id, after=after)


def _entity(db: Session, model, entity_id: int, label: str):
    row = db.get(model, entity_id)
    if row is None or (hasattr(row, "deleted_at") and row.deleted_at is not None):
        raise HTTPException(status_code=422, detail=f"{label} {entity_id} does not exist or is inactive.")
    return row


def _balance(db: Session, item_id: int, store_id: int) -> StockBalance:
    row = db.scalar(
        select(StockBalance)
        .where(StockBalance.item_id == item_id, StockBalance.store_id == store_id)
        .with_for_update()
    )
    if row is None:
        values = {
            "item_id": item_id,
            "store_id": store_id,
            "quantity": Decimal("0"),
            "average_unit_cost": Decimal("0"),
        }
        dialect = db.get_bind().dialect.name
        if dialect == "postgresql":
            statement = postgres_insert(StockBalance).values(**values).on_conflict_do_nothing(
                index_elements=[StockBalance.item_id, StockBalance.store_id]
            )
            db.execute(statement)
        elif dialect == "sqlite":
            statement = sqlite_insert(StockBalance).values(**values).on_conflict_do_nothing(
                index_elements=[StockBalance.item_id, StockBalance.store_id]
            )
            db.execute(statement)
        else:
            db.add(StockBalance(**values))
            db.flush()
        row = db.scalar(
            select(StockBalance)
            .where(StockBalance.item_id == item_id, StockBalance.store_id == store_id)
            .with_for_update()
        )
        if row is None:
            raise RuntimeError("Could not initialize the stock balance row.")
    return row


def _increase_balance(balance: StockBalance, quantity: Decimal, unit_cost: Decimal) -> None:
    old_quantity = balance.quantity
    new_quantity = old_quantity + quantity
    if new_quantity <= 0:
        raise HTTPException(status_code=409, detail="A stock receipt must leave a positive balance.")
    balance.average_unit_cost = (
        (old_quantity * balance.average_unit_cost + quantity * unit_cost) / new_quantity
    ).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
    balance.quantity = new_quantity


def _decrease_balance(balance: StockBalance, quantity: Decimal) -> None:
    if quantity > balance.quantity:
        raise HTTPException(
            status_code=409,
            detail=f"Insufficient stock: available {balance.quantity}, requested {quantity}.",
        )
    balance.quantity -= quantity


def _movement_data(movement: StockMovement, running_balance: Decimal | None = None) -> dict:
    return {
        "id": movement.id,
        "item_id": movement.item_id,
        "store_id": movement.store_id,
        "movement_type": movement.movement_type,
        "movement_date": movement.movement_date.isoformat(),
        "quantity": str(movement.quantity),
        "unit_cost": str(movement.unit_cost) if movement.unit_cost is not None else None,
        "project_id": movement.project_id,
        "staff_id": movement.staff_id,
        "purpose": movement.purpose,
        "reason": movement.reason,
        "related_movement_id": movement.related_movement_id,
        "running_balance": str(running_balance) if running_balance is not None else None,
    }


@router.post("/goods-receipts", status_code=status.HTTP_201_CREATED)
def receive_goods(
    payload: GoodsReceiptInput,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*RECEIVE_ROLES)),
) -> dict:
    _entity(db, Store, payload.store_id, "Store")
    order = None
    if payload.purchase_order_id is not None:
        order = db.scalar(
            select(PurchaseOrder)
            .where(PurchaseOrder.id == payload.purchase_order_id)
            .with_for_update()
        )
        if order is None or order.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Purchase order not found.")
        if order.delivery_status == DeliveryStatus.CLOSED.value:
            raise HTTPException(status_code=409, detail="Closed purchase orders cannot receive goods.")

    receipt = GoodsReceipt(
        purchase_order_id=order.id if order else None,
        received_date=payload.received_date,
        receiver_id=payload.receiver_id,
        delivery_note_number=payload.delivery_note_number,
        store_id=payload.store_id,
        project_id=payload.project_id if payload.project_id is not None else (order.project_id if order else None),
        purpose=payload.purpose,
    )
    if payload.receiver_id is not None:
        _entity(db, Staff, payload.receiver_id, "Receiver")
    receipt_project_id = payload.project_id if payload.project_id is not None else (order.project_id if order else None)
    if receipt_project_id is not None:
        _entity(db, Project, receipt_project_id, "Project")
    receipt.project_id = receipt_project_id
    db.add(receipt)
    db.flush()

    seen_po_lines: set[int] = set()
    po_line_quantities: dict[int, Decimal] = {}
    created_movements: list[StockMovement] = []
    created_receipt_lines: list[GoodsReceiptLine] = []
    for line_input in payload.lines:
        po_line = None
        if order is not None:
            if line_input.purchase_order_line_id is None:
                raise HTTPException(status_code=422, detail="Each PO receipt line must reference a purchase-order line.")
            if line_input.purchase_order_line_id in seen_po_lines:
                raise HTTPException(status_code=422, detail="A purchase-order line may appear only once per receipt.")
            seen_po_lines.add(line_input.purchase_order_line_id)
            po_line = db.scalar(
                select(PurchaseOrderLine)
                .where(PurchaseOrderLine.id == line_input.purchase_order_line_id)
                .with_for_update()
            )
            if po_line is None or po_line.purchase_order_id != order.id:
                raise HTTPException(status_code=422, detail="Receipt line does not belong to this purchase order.")
            if po_line.item_id is None:
                raise HTTPException(status_code=422, detail="The purchase-order line must reference an inventory item.")
            if line_input.item_id is not None and line_input.item_id != po_line.item_id:
                raise HTTPException(status_code=422, detail="Receipt item does not match the purchase-order line.")
            already_received = db.scalar(
                select(func.coalesce(func.sum(GoodsReceiptLine.quantity), 0)).where(
                    GoodsReceiptLine.purchase_order_line_id == po_line.id
                )
            ) or Decimal("0")
            po_line_quantities[po_line.id] = already_received + line_input.quantity
            if po_line_quantities[po_line.id] > po_line.quantity:
                raise HTTPException(
                    status_code=409,
                    detail=f"Receipt exceeds ordered quantity for purchase-order line {po_line.id}.",
                )
            item_id = po_line.item_id
            description = line_input.description or po_line.description
            unit_cost = line_input.unit_cost if line_input.unit_cost is not None else po_line.unit_price
        else:
            if line_input.purchase_order_line_id is not None:
                raise HTTPException(status_code=422, detail="A direct receipt cannot reference a purchase-order line.")
            if line_input.item_id is None:
                raise HTTPException(status_code=422, detail="Direct receipt lines require an item.")
            if line_input.unit_cost is None:
                raise HTTPException(status_code=422, detail="Direct receipt lines require a unit cost.")
            item_id = line_input.item_id
            description = line_input.description
            unit_cost = line_input.unit_cost

        item = _entity(db, Item, item_id, "Item")
        balance = _balance(db, item_id, payload.store_id)
        _increase_balance(balance, line_input.quantity, unit_cost)
        receipt_line = GoodsReceiptLine(
            receipt_id=receipt.id,
            purchase_order_line_id=po_line.id if po_line else None,
            item_id=item_id,
            description=description or item.name,
            quantity=line_input.quantity,
            unit_cost=unit_cost,
        )
        db.add(receipt_line)
        created_receipt_lines.append(receipt_line)
        movement = StockMovement(
            item_id=item_id,
            store_id=payload.store_id,
            movement_type=StockMovementType.RECEIPT.value,
            movement_date=_movement_time(payload.received_date),
            quantity=line_input.quantity,
            unit_cost=unit_cost,
            project_id=receipt.project_id,
            staff_id=payload.receiver_id,
            purpose=payload.purpose,
        )
        db.add(movement)
        created_movements.append(movement)

    if order is not None:
        db.flush()
        all_order_lines = list(db.scalars(
            select(PurchaseOrderLine).where(PurchaseOrderLine.purchase_order_id == order.id)
        ))
        outstanding = False
        for po_line in all_order_lines:
            received = db.scalar(
                select(func.coalesce(func.sum(GoodsReceiptLine.quantity), 0)).where(
                    GoodsReceiptLine.purchase_order_line_id == po_line.id
                )
            ) or Decimal("0")
            if received < po_line.quantity:
                outstanding = True
                break
        order.delivery_status = (
            DeliveryStatus.PARTIALLY_RECEIVED.value if outstanding else DeliveryStatus.RECEIVED.value
        )

    _audit(db, user, "receive", "goods_receipt", receipt.id, {"movement_count": len(created_movements)})
    db.commit()
    for movement in created_movements:
        db.refresh(movement)
    for receipt_line in created_receipt_lines:
        db.refresh(receipt_line)
    return {
        "receipt_id": receipt.id,
        "purchase_order_id": order.id if order else None,
        "delivery_status": order.delivery_status if order else None,
        "lines": [{
            "id": line.id,
            "purchase_order_line_id": line.purchase_order_line_id,
            "item_id": line.item_id,
            "quantity": str(line.quantity),
            "unit_cost": str(line.unit_cost),
        } for line in created_receipt_lines],
        "movements": [_movement_data(movement) for movement in created_movements],
    }


@router.get("/goods-receipts")
def list_goods_receipts(
    purchase_order_id: int | None = Query(default=None, gt=0),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("Admin", "Procurement Officer", "Approver", "Director", "Store Keeper", "Project Manager", "Finance")),
) -> dict:
    statement = select(GoodsReceipt).order_by(GoodsReceipt.received_date.desc(), GoodsReceipt.id.desc())
    if purchase_order_id is not None:
        statement = statement.where(GoodsReceipt.purchase_order_id == purchase_order_id)
    if user.role == "Project Manager":
        statement = statement.where(GoodsReceipt.project_id == user.project_id)
    count = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    receipts = db.scalars(statement.offset(offset).limit(limit)).all()
    result = []
    for receipt in receipts:
        lines = db.scalars(select(GoodsReceiptLine).where(
            GoodsReceiptLine.receipt_id == receipt.id
        ).order_by(GoodsReceiptLine.id)).all()
        result.append({
            "id": receipt.id,
            "purchase_order_id": receipt.purchase_order_id,
            "received_date": receipt.received_date.isoformat(),
            "delivery_note_number": receipt.delivery_note_number,
            "store_id": receipt.store_id,
            "project_id": receipt.project_id,
            "lines": [{
                "id": line.id,
                "purchase_order_line_id": line.purchase_order_line_id,
                "item_id": line.item_id,
                "description": line.description,
                "quantity": str(line.quantity),
                "unit_cost": str(line.unit_cost),
            } for line in lines],
        })
    return {"items": result, "total": count, "offset": offset, "limit": limit}


@router.post("/stock/issues", status_code=status.HTTP_201_CREATED)
def issue_stock(
    payload: StockIssueInput,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*STORE_ROLES)),
) -> dict:
    _entity(db, Item, payload.item_id, "Item")
    _entity(db, Store, payload.store_id, "Store")
    if payload.project_id is not None:
        _entity(db, Project, payload.project_id, "Project")
    if payload.staff_id is not None:
        _entity(db, Staff, payload.staff_id, "Staff member")
    if not payload.purpose.strip():
        raise HTTPException(status_code=422, detail="A stock-issue purpose is required.")
    balance = _balance(db, payload.item_id, payload.store_id)
    _decrease_balance(balance, payload.quantity)
    movement = StockMovement(
        item_id=payload.item_id,
        store_id=payload.store_id,
        movement_type=StockMovementType.ISSUE.value,
        movement_date=_movement_time(payload.movement_date),
        quantity=payload.quantity,
        unit_cost=balance.average_unit_cost,
        project_id=payload.project_id,
        staff_id=payload.staff_id,
        purpose=payload.purpose.strip(),
    )
    db.add(movement)
    db.flush()
    _audit(db, user, "issue", "stock_movement", movement.id, {"quantity": str(payload.quantity)})
    db.commit()
    db.refresh(movement)
    return _movement_data(movement)


@router.post("/stock/returns", status_code=status.HTTP_201_CREATED)
def return_stock(
    payload: StockReturnInput,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*STORE_ROLES)),
) -> dict:
    original = db.scalar(
        select(StockMovement)
        .where(StockMovement.id == payload.original_issue_id)
        .with_for_update()
    )
    if original is None or original.movement_type != StockMovementType.ISSUE.value:
        raise HTTPException(status_code=422, detail="The referenced movement is not a stock issue.")
    already_returned = db.scalar(
        select(func.coalesce(func.sum(StockMovement.quantity), 0)).where(
            StockMovement.related_movement_id == original.id,
            StockMovement.movement_type == StockMovementType.RETURN.value,
        )
    ) or Decimal("0")
    if already_returned + payload.quantity > original.quantity:
        raise HTTPException(status_code=409, detail="Return quantity exceeds the unreturned issue quantity.")
    if not payload.reason.strip():
        raise HTTPException(status_code=422, detail="A return reason is required.")
    balance = _balance(db, original.item_id, original.store_id)
    cost = original.unit_cost or balance.average_unit_cost
    _increase_balance(balance, payload.quantity, cost)
    movement = StockMovement(
        item_id=original.item_id,
        store_id=original.store_id,
        movement_type=StockMovementType.RETURN.value,
        movement_date=_movement_time(payload.movement_date),
        quantity=payload.quantity,
        unit_cost=cost,
        project_id=original.project_id,
        staff_id=original.staff_id,
        purpose="Return to store",
        reason=payload.reason.strip(),
        related_movement_id=original.id,
    )
    db.add(movement)
    db.flush()
    _audit(db, user, "return", "stock_movement", movement.id, {"quantity": str(payload.quantity)})
    db.commit()
    db.refresh(movement)
    return _movement_data(movement)


@router.post("/stock/transfers", status_code=status.HTTP_201_CREATED)
def transfer_stock(
    payload: StockTransferInput,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*STORE_ROLES)),
) -> dict:
    if payload.from_store_id == payload.to_store_id:
        raise HTTPException(status_code=422, detail="Source and destination stores must be different.")
    if not payload.reason.strip():
        raise HTTPException(status_code=422, detail="A transfer reason is required.")
    _entity(db, Item, payload.item_id, "Item")
    _entity(db, Store, payload.from_store_id, "Store")
    _entity(db, Store, payload.to_store_id, "Store")
    first_store_id, second_store_id = sorted((payload.from_store_id, payload.to_store_id))
    first_balance = _balance(db, payload.item_id, first_store_id)
    second_balance = _balance(db, payload.item_id, second_store_id)
    source = first_balance if payload.from_store_id == first_store_id else second_balance
    destination = second_balance if payload.to_store_id == second_store_id else first_balance
    _decrease_balance(source, payload.quantity)
    unit_cost = source.average_unit_cost
    _increase_balance(destination, payload.quantity, unit_cost)

    transfer_out = StockMovement(
        item_id=payload.item_id,
        store_id=payload.from_store_id,
        movement_type=StockMovementType.TRANSFER_OUT.value,
        movement_date=_movement_time(payload.movement_date),
        quantity=payload.quantity,
        unit_cost=unit_cost,
        reason=payload.reason.strip(),
    )
    db.add(transfer_out)
    db.flush()
    transfer_in = StockMovement(
        item_id=payload.item_id,
        store_id=payload.to_store_id,
        movement_type=StockMovementType.TRANSFER_IN.value,
        movement_date=transfer_out.movement_date,
        quantity=payload.quantity,
        unit_cost=unit_cost,
        reason=payload.reason.strip(),
        related_movement_id=transfer_out.id,
    )
    db.add(transfer_in)
    db.flush()
    transfer_out.related_movement_id = transfer_in.id
    _audit(db, user, "transfer", "stock_movement", transfer_out.id, {
        "quantity": str(payload.quantity),
        "to_movement_id": transfer_in.id,
    })
    db.commit()
    db.refresh(transfer_out)
    db.refresh(transfer_in)
    return {"out": _movement_data(transfer_out), "in": _movement_data(transfer_in)}


@router.post("/stock/adjustments", status_code=status.HTTP_201_CREATED)
def adjust_stock(
    payload: StockAdjustmentInput,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*ADJUST_ROLES)),
) -> dict:
    if payload.quantity_delta == 0:
        raise HTTPException(status_code=422, detail="Adjustment quantity must not be zero.")
    if not payload.reason.strip():
        raise HTTPException(status_code=422, detail="An adjustment reason is required.")
    _entity(db, Item, payload.item_id, "Item")
    _entity(db, Store, payload.store_id, "Store")
    balance = _balance(db, payload.item_id, payload.store_id)
    if payload.quantity_delta < 0:
        _decrease_balance(balance, abs(payload.quantity_delta))
    else:
        _increase_balance(balance, payload.quantity_delta, balance.average_unit_cost)
    movement = StockMovement(
        item_id=payload.item_id,
        store_id=payload.store_id,
        movement_type=StockMovementType.ADJUSTMENT.value,
        movement_date=_movement_time(payload.movement_date),
        quantity=payload.quantity_delta,
        unit_cost=balance.average_unit_cost,
        reason=payload.reason.strip(),
    )
    db.add(movement)
    db.flush()
    _audit(db, user, "adjust", "stock_movement", movement.id, {"quantity_delta": str(payload.quantity_delta)})
    db.commit()
    db.refresh(movement)
    return _movement_data(movement)


@router.get("/stock/balances")
def list_stock_balances(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    item_id: int | None = Query(default=None, gt=0),
    store_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("Admin", "Procurement Officer", "Approver", "Store Keeper", "Project Manager", "Finance")),
) -> dict:
    if user.role == "Project Manager":
        raise HTTPException(status_code=403, detail="Stock balances are not allocated by project.")
    statement = select(StockBalance)
    if item_id is not None:
        statement = statement.where(StockBalance.item_id == item_id)
    if store_id is not None:
        statement = statement.where(StockBalance.store_id == store_id)
    count = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    rows = db.scalars(statement.order_by(StockBalance.item_id, StockBalance.store_id).offset(offset).limit(limit)).all()
    items = []
    for balance in rows:
        item = db.get(Item, balance.item_id)
        store = db.get(Store, balance.store_id)
        items.append({
            "item_id": balance.item_id,
            "item": item.name if item else None,
            "store_id": balance.store_id,
            "store": store.name if store else None,
            "quantity": str(balance.quantity),
            "average_unit_cost": str(balance.average_unit_cost),
            "stock_value": str((balance.quantity * balance.average_unit_cost).quantize(MONEY_QUANTUM)),
        })
    return {"items": items, "total": count, "offset": offset, "limit": limit}


@router.get("/stock/movements")
def list_stock_movements(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    item_id: int | None = Query(default=None, gt=0),
    store_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("Admin", "Procurement Officer", "Approver", "Store Keeper", "Project Manager", "Finance")),
) -> dict:
    filters = []
    if item_id is not None:
        filters.append(StockMovement.item_id == item_id)
    if store_id is not None:
        filters.append(StockMovement.store_id == store_id)
    if user.role == "Project Manager":
        filters.append(StockMovement.project_id == user.project_id)
    statement = select(StockMovement).where(*filters)
    count = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    delta = case(
        (
            StockMovement.movement_type.in_([
                StockMovementType.ISSUE.value,
                StockMovementType.TRANSFER_OUT.value,
            ]),
            -StockMovement.quantity,
        ),
        (
            StockMovement.movement_type == StockMovementType.ADJUSTMENT.value,
            StockMovement.quantity,
        ),
        else_=StockMovement.quantity,
    )
    running_balance = func.sum(delta).over(
        partition_by=(StockMovement.item_id, StockMovement.store_id),
        order_by=(StockMovement.movement_date, StockMovement.id),
    )
    rows = db.execute(
        select(StockMovement, running_balance)
        .where(*filters)
        .order_by(StockMovement.movement_date.desc(), StockMovement.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return {
        "items": [
            _movement_data(movement, balance if user.role != "Project Manager" else None)
            for movement, balance in rows
        ],
        "total": count,
        "offset": offset,
        "limit": limit,
    }
