import csv
import io
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session

from alwen.auth import require_roles
from alwen.database import get_db
from alwen.models import (
    Category,
    GoodsReceiptLine,
    Item,
    Project,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseRequest,
    PurchaseRequestLine,
    QuotationLine,
    RequestStatus,
    StockBalance,
    StockMovement,
    StockMovementType,
    Store,
    Supplier,
    SupplierQuote,
    User,
)
from alwen.time_utils import BUSINESS_TIMEZONE, business_today


router = APIRouter(prefix="/analytics", tags=["analytics"])
READ_ROLES = ("Admin", "Procurement Officer", "Approver", "Store Keeper", "Project Manager", "Finance")
ZERO = Decimal("0")
CENT = Decimal("0.01")


def _business_midnight_utc(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=BUSINESS_TIMEZONE).astimezone(timezone.utc)


def _validate_dates(start_date: date | None, end_date: date | None) -> None:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date must be on or before end_date.")


def _scope_project(project_id: int | None, user: User) -> int | None:
    if user.role != "Project Manager":
        return project_id
    if user.project_id is None:
        return -1
    if project_id is not None and project_id != user.project_id:
        raise HTTPException(status_code=403, detail="You may only view analytics for your assigned project.")
    return user.project_id


def _order_lines(
    db: Session,
    user: User,
    start_date: date | None,
    end_date: date | None,
    project_id: int | None,
    supplier_id: int | None,
    category_id: int | None,
):
    project_id = _scope_project(project_id, user)
    received_quantity = (
        select(func.coalesce(func.sum(GoodsReceiptLine.quantity), ZERO))
        .where(GoodsReceiptLine.purchase_order_line_id == PurchaseOrderLine.id)
        .scalar_subquery()
    )
    statement = (
        select(
            PurchaseOrder.id,
            PurchaseOrder.order_number,
            PurchaseOrder.order_date,
            PurchaseOrder.delivery_status,
            PurchaseOrder.supplier_id,
            Supplier.name.label("supplier_name"),
            PurchaseOrder.project_id,
            Project.name.label("project_name"),
            PurchaseOrderLine.id.label("line_id"),
            PurchaseOrderLine.item_id,
            PurchaseOrderLine.description,
            Item.name.label("item_name"),
            PurchaseOrderLine.quantity,
            PurchaseOrderLine.unit_price,
            PurchaseOrderLine.subtotal,
            Item.category_id,
            Category.name.label("category_name"),
            received_quantity.label("received_quantity"),
        )
        .join(PurchaseOrderLine, PurchaseOrderLine.purchase_order_id == PurchaseOrder.id)
        .outerjoin(Supplier, Supplier.id == PurchaseOrder.supplier_id)
        .outerjoin(Project, Project.id == PurchaseOrder.project_id)
        .outerjoin(Item, Item.id == PurchaseOrderLine.item_id)
        .outerjoin(Category, Category.id == Item.category_id)
        .where(PurchaseOrder.deleted_at.is_(None))
    )
    if start_date:
        statement = statement.where(PurchaseOrder.order_date >= start_date)
    if end_date:
        statement = statement.where(PurchaseOrder.order_date <= end_date)
    if project_id is not None:
        statement = statement.where(PurchaseOrder.project_id == project_id)
    if supplier_id is not None:
        statement = statement.where(PurchaseOrder.supplier_id == supplier_id)
    if category_id is not None:
        statement = statement.where(Item.category_id == category_id)
    return db.execute(statement.order_by(PurchaseOrder.order_date, PurchaseOrder.id, PurchaseOrderLine.id)).all()


def _purchase_request_counts(
    db: Session,
    user: User,
    start_date: date | None,
    end_date: date | None,
    project_id: int | None,
    supplier_id: int | None,
    category_id: int | None,
) -> dict[str, int]:
    project_id = _scope_project(project_id, user)
    statement = select(PurchaseRequest.status, func.count(PurchaseRequest.id)).where(
        PurchaseRequest.deleted_at.is_(None)
    )
    if start_date:
        statement = statement.where(PurchaseRequest.request_date >= start_date)
    if end_date:
        statement = statement.where(PurchaseRequest.request_date <= end_date)
    if project_id is not None:
        statement = statement.where(PurchaseRequest.project_id == project_id)
    if supplier_id is not None or category_id is not None:
        matching_lines = select(PurchaseRequestLine.request_id).outerjoin(
            Item, Item.id == PurchaseRequestLine.item_id
        )
        if supplier_id is not None:
            matching_lines = matching_lines.outerjoin(
                SupplierQuote, SupplierQuote.request_id == PurchaseRequestLine.request_id
            ).where(or_(
                PurchaseRequestLine.proposed_supplier_id == supplier_id,
                SupplierQuote.supplier_id == supplier_id,
            ))
        if category_id is not None:
            matching_lines = matching_lines.where(Item.category_id == category_id)
        statement = statement.where(PurchaseRequest.id.in_(matching_lines.distinct()))
    rows = db.execute(statement.group_by(PurchaseRequest.status)).all()
    return {status: count for status, count in rows}


def _stock_snapshot(db: Session, category_id: int | None) -> dict:
    statement = (
        select(
            Item.id,
            Item.name,
            Item.reorder_level,
            Category.name.label("category"),
            func.coalesce(func.sum(StockBalance.quantity), ZERO).label("quantity"),
            func.coalesce(func.sum(StockBalance.quantity * StockBalance.average_unit_cost), ZERO).label("stock_value"),
        )
        .outerjoin(StockBalance, StockBalance.item_id == Item.id)
        .outerjoin(Category, Category.id == Item.category_id)
        .where(Item.deleted_at.is_(None))
        .group_by(Item.id, Item.name, Item.reorder_level, Category.name)
    )
    if category_id is not None:
        statement = statement.where(Item.category_id == category_id)
    rows = db.execute(statement).all()
    low_stock = [
        {
            "item_id": row.id,
            "item": row.name,
            "category": row.category,
            "quantity": str(row.quantity),
            "reorder_level": str(row.reorder_level),
        }
        for row in rows
        if row.reorder_level > 0 and row.quantity <= row.reorder_level
    ]
    balances_statement = (
        select(
            StockBalance.item_id,
            Item.name.label("item"),
            Category.name.label("category"),
            StockBalance.store_id,
            Store.name.label("store"),
            StockBalance.quantity,
            StockBalance.average_unit_cost,
        )
        .join(Item, Item.id == StockBalance.item_id)
        .join(Store, Store.id == StockBalance.store_id)
        .outerjoin(Category, Category.id == Item.category_id)
        .where(Item.deleted_at.is_(None))
        .order_by(Item.name, Store.name)
    )
    if category_id is not None:
        balances_statement = balances_statement.where(Item.category_id == category_id)
    by_store = [
        {
            "item_id": row.item_id,
            "item": row.item,
            "category": row.category,
            "store_id": row.store_id,
            "store": row.store,
            "quantity": str(row.quantity),
            "average_unit_cost": str(row.average_unit_cost),
            "stock_value": str((row.quantity * row.average_unit_cost).quantize(CENT)),
        }
        for row in db.execute(balances_statement)
    ]
    return {
        "stock_value": str(sum((row.stock_value for row in rows), ZERO).quantize(CENT)),
        "item_count": len(rows),
        "low_stock_count": len(low_stock),
        "low_stock_items": low_stock,
        "by_store": by_store,
    }


def _stock_activity(
    db: Session,
    user: User,
    start_date: date | None,
    end_date: date | None,
    project_id: int | None,
    category_id: int | None,
) -> tuple[list[dict], list[dict]]:
    project_id = _scope_project(project_id, user)
    statement = (
        select(
            StockMovement.movement_date,
            StockMovement.movement_type,
            StockMovement.quantity,
            StockMovement.project_id,
            Project.name.label("project_name"),
        )
        .join(Item, Item.id == StockMovement.item_id)
        .outerjoin(Project, Project.id == StockMovement.project_id)
        .where(StockMovement.movement_type.in_([
            StockMovementType.RECEIPT.value,
            StockMovementType.ISSUE.value,
            StockMovementType.RETURN.value,
        ]))
    )
    if start_date:
        statement = statement.where(StockMovement.movement_date >= _business_midnight_utc(start_date))
    if end_date:
        statement = statement.where(StockMovement.movement_date < _business_midnight_utc(end_date + timedelta(days=1)))
    if project_id is not None:
        statement = statement.where(StockMovement.project_id == project_id)
    if category_id is not None:
        statement = statement.where(Item.category_id == category_id)
    monthly: dict[str, dict[str, Decimal]] = defaultdict(lambda: {"received": ZERO, "issued": ZERO})
    usage: dict[tuple[int | None, str], Decimal] = defaultdict(lambda: ZERO)
    for row in db.execute(statement.order_by(StockMovement.movement_date, StockMovement.id)):
        movement_time = row.movement_date
        if movement_time.tzinfo is None:
            movement_time = movement_time.replace(tzinfo=timezone.utc)
        local_date = movement_time.astimezone(BUSINESS_TIMEZONE).date()
        month = local_date.strftime("%Y-%m")
        if row.movement_type == StockMovementType.RECEIPT.value:
            monthly[month]["received"] += row.quantity
        elif row.movement_type == StockMovementType.ISSUE.value:
            monthly[month]["issued"] += row.quantity
            usage[(row.project_id, row.project_name or "Unallocated")] += row.quantity
        else:
            monthly[month]["issued"] -= row.quantity
            usage[(row.project_id, row.project_name or "Unallocated")] -= row.quantity
    monthly_rows = [
        {
            "month": month,
            "received": str(values["received"]),
            "issued": str(values["issued"]),
        }
        for month, values in sorted(monthly.items())
    ]
    usage = [
        {"project_id": key[0], "project": key[1], "quantity": str(quantity)}
        for key, quantity in sorted(usage.items(), key=lambda entry: (entry[0][1], entry[0][0] or 0))
    ]
    return monthly_rows, usage


def _supplier_scorecard(
    db: Session,
    user: User,
    start_date: date | None,
    end_date: date | None,
    project_id: int | None,
    supplier_id: int | None,
    category_id: int | None,
) -> list[dict]:
    project_id = _scope_project(project_id, user)
    lowest_rate = (
        select(func.min(QuotationLine.rate))
        .where(QuotationLine.request_line_id == PurchaseRequestLine.id)
        .scalar_subquery()
    )
    proposed_rate = (
        select(QuotationLine.rate)
        .join(SupplierQuote, SupplierQuote.id == QuotationLine.quote_id)
        .where(
            SupplierQuote.request_id == PurchaseRequestLine.request_id,
            SupplierQuote.supplier_id == PurchaseRequestLine.proposed_supplier_id,
            QuotationLine.request_line_id == PurchaseRequestLine.id,
        )
        .limit(1)
        .scalar_subquery()
    )
    statement = (
        select(
            Supplier.id,
            Supplier.name,
            func.count(PurchaseRequestLine.id).label("proposed_count"),
            func.sum(case((proposed_rate == lowest_rate, 1), else_=0)).label("lowest_count"),
        )
        .join(PurchaseRequestLine, PurchaseRequestLine.proposed_supplier_id == Supplier.id)
        .join(PurchaseRequest, PurchaseRequest.id == PurchaseRequestLine.request_id)
        .outerjoin(Item, Item.id == PurchaseRequestLine.item_id)
        .where(PurchaseRequest.deleted_at.is_(None))
        .where(PurchaseRequest.status.notin_([RequestStatus.DRAFT.value, RequestStatus.REJECTED.value]))
    )
    if start_date:
        statement = statement.where(PurchaseRequest.request_date >= start_date)
    if end_date:
        statement = statement.where(PurchaseRequest.request_date <= end_date)
    if project_id is not None:
        statement = statement.where(PurchaseRequest.project_id == project_id)
    if supplier_id is not None:
        statement = statement.where(Supplier.id == supplier_id)
    if category_id is not None:
        statement = statement.where(Item.category_id == category_id)
    rows = db.execute(statement.group_by(Supplier.id, Supplier.name).order_by(Supplier.name)).all()
    return [
        {
            "supplier_id": row.id,
            "supplier": row.name,
            "proposed_count": row.proposed_count,
            "lowest_count": row.lowest_count or 0,
            "win_rate": str((Decimal(row.lowest_count or 0) * 100 / row.proposed_count).quantize(CENT)),
        }
        for row in rows
    ]


def _price_history(
    db: Session,
    user: User,
    start_date: date | None,
    end_date: date | None,
    project_id: int | None,
    supplier_id: int | None,
    category_id: int | None,
) -> list[dict]:
    project_id = _scope_project(project_id, user)
    statement = (
        select(
            Item.id,
            Item.name,
            Supplier.id.label("supplier_id"),
            Supplier.name.label("supplier"),
            QuotationLine.rate,
        )
        .join(PurchaseRequestLine, PurchaseRequestLine.item_id == Item.id)
        .join(QuotationLine, QuotationLine.request_line_id == PurchaseRequestLine.id)
        .join(SupplierQuote, SupplierQuote.id == QuotationLine.quote_id)
        .join(Supplier, Supplier.id == SupplierQuote.supplier_id)
        .join(PurchaseRequest, PurchaseRequest.id == PurchaseRequestLine.request_id)
        .where(PurchaseRequest.deleted_at.is_(None))
    )
    if start_date:
        statement = statement.where(or_(
            SupplierQuote.quote_date >= start_date,
            and_(SupplierQuote.quote_date.is_(None), PurchaseRequest.request_date >= start_date),
        ))
    if end_date:
        statement = statement.where(or_(
            SupplierQuote.quote_date <= end_date,
            and_(SupplierQuote.quote_date.is_(None), PurchaseRequest.request_date <= end_date),
        ))
    if project_id is not None:
        statement = statement.where(PurchaseRequest.project_id == project_id)
    if supplier_id is not None:
        statement = statement.where(Supplier.id == supplier_id)
    if category_id is not None:
        statement = statement.where(Item.category_id == category_id)
    grouped: dict[tuple[int, int], dict] = {}
    for row in db.execute(statement.order_by(Item.name, Supplier.name)):
        key = (row.id, row.supplier_id)
        group = grouped.setdefault(key, {
            "item_id": row.id,
            "item": row.name,
            "supplier_id": row.supplier_id,
            "supplier": row.supplier,
            "rate_total": ZERO,
            "lowest_rate": row.rate,
            "highest_rate": row.rate,
            "quote_count": 0,
        })
        group["rate_total"] += row.rate
        group["lowest_rate"] = min(group["lowest_rate"], row.rate)
        group["highest_rate"] = max(group["highest_rate"], row.rate)
        group["quote_count"] += 1
    result = []
    for group in grouped.values():
        result.append({
            "item_id": group["item_id"],
            "item": group["item"],
            "supplier_id": group["supplier_id"],
            "supplier": group["supplier"],
            "average_rate": str((group["rate_total"] / group["quote_count"]).quantize(CENT)),
            "lowest_rate": str(group["lowest_rate"]),
            "highest_rate": str(group["highest_rate"]),
            "quote_count": group["quote_count"],
        })
    return result


def _build_dashboard(
    db: Session,
    user: User,
    start_date: date | None,
    end_date: date | None,
    project_id: int | None,
    supplier_id: int | None,
    category_id: int | None,
) -> dict:
    _validate_dates(start_date, end_date)
    rows = _order_lines(db, user, start_date, end_date, project_id, supplier_id, category_id)
    totals: dict[str, dict] = {
        key: defaultdict(lambda: {"value": ZERO, "quantity": ZERO, "orders": set()})
        for key in ("month", "supplier", "project", "category", "item")
    }
    period_value = ZERO
    open_po_value = ZERO
    this_month_value = ZERO
    last_month_value = ZERO
    po_ids: set[int] = set()
    current_month = business_today().replace(day=1)
    last_month = current_month.fromordinal(current_month.toordinal() - 1).replace(day=1)

    for row in rows:
        value = row.subtotal or ZERO
        period_value += value
        po_ids.add(row.id)
        if row.order_date:
            month_key = row.order_date.strftime("%Y-%m")
            month_group = totals["month"][month_key]
            month_group["value"] += value
            month_group["quantity"] += row.quantity
            month_group["orders"].add(row.id)
            if row.order_date.year == current_month.year and row.order_date.month == current_month.month:
                this_month_value += value
            if row.order_date.year == last_month.year and row.order_date.month == last_month.month:
                last_month_value += value

        supplier_name = row.supplier_name or "Unassigned"
        project_name = row.project_name or "Unallocated"
        category_name = row.category_name or "Uncategorized"
        item_name = row.item_name or row.description or "Unspecified"
        for key, name in (
            ("supplier", supplier_name),
            ("project", project_name),
            ("category", category_name),
            ("item", item_name),
        ):
            group = totals[key][name]
            group["value"] += value
            group["quantity"] += row.quantity
            group["orders"].add(row.id)

        if row.delivery_status in ("Open", "Partially received"):
            remaining = max(row.quantity - row.received_quantity, ZERO)
            open_po_value += remaining * row.unit_price

    def grouped_data(key: str) -> list[dict]:
        values = totals[key]
        result = []
        for name, group in values.items():
            result.append({
                key: name,
                "value": str(group["value"].quantize(CENT)),
                "quantity": str(group["quantity"]),
                "purchase_order_count": len(group["orders"]),
                "share_percent": str(
                    (group["value"] * 100 / period_value).quantize(CENT) if period_value else ZERO
                ),
            })
        return sorted(result, key=lambda group: Decimal(group["value"]), reverse=True)

    monthly = [
        {
            "month": month,
            "value": str(group["value"].quantize(CENT)),
            "quantity": str(group["quantity"]),
            "purchase_order_count": len(group["orders"]),
        }
        for month, group in sorted(totals["month"].items())
    ]
    project_scope = _scope_project(project_id, user)
    funnel = _purchase_request_counts(
        db, user, start_date, end_date, project_scope, supplier_id, category_id
    )
    stock = None if user.role == "Project Manager" else _stock_snapshot(db, category_id)
    stock_monthly, usage = _stock_activity(db, user, start_date, end_date, project_scope, category_id)
    current_month_key = current_month.strftime("%Y-%m")
    last_month_key = last_month.strftime("%Y-%m")
    return {
        "filters": {
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
            "project_id": project_scope,
            "supplier_id": supplier_id,
            "category_id": category_id,
        },
        "summary": {
            "period_po_commitments": str(period_value.quantize(CENT)),
            "purchase_order_count": len(po_ids),
            "open_po_value": str(open_po_value.quantize(CENT)),
            "this_month_po_commitments": str(this_month_value.quantize(CENT)),
            "last_month_po_commitments": str(last_month_value.quantize(CENT)),
            "this_month": current_month_key,
            "last_month": last_month_key,
            "top_supplier": grouped_data("supplier")[0]["supplier"] if totals["supplier"] else None,
            "top_project": grouped_data("project")[0]["project"] if totals["project"] else None,
        },
        "monthly_commitments": monthly,
        "supplier_spend": grouped_data("supplier"),
        "project_spend": grouped_data("project"),
        "category_spend": grouped_data("category"),
        "item_spend": grouped_data("item"),
        "purchase_request_funnel": [
            {"status": status, "count": funnel.get(status, 0)}
            for status in (
                RequestStatus.DRAFT.value,
                RequestStatus.SUBMITTED.value,
                RequestStatus.APPROVED.value,
                RequestStatus.REJECTED.value,
                RequestStatus.CONVERTED.value,
            )
        ],
        "supplier_scorecard": _supplier_scorecard(
            db, user, start_date, end_date, project_scope, supplier_id, category_id
        ),
        "price_history": _price_history(
            db, user, start_date, end_date, project_scope, supplier_id, category_id
        ),
        "stock": stock,
        "stock_movements_by_month": stock_monthly,
        "usage_by_project": usage,
        "definitions": {
            "spend": "Purchase-order line commitments by order date; this is not paid expenditure.",
            "open_po_value": "Unreceived quantities on open and partially received purchase orders.",
            "stock_snapshot": "Current balances are independent of date, project, and supplier filters; category filters apply.",
            "supplier_win_rate": "Selected lowest-quote supplier lines divided by submitted, approved, or converted proposals.",
        },
    }


@router.get("/dashboard")
def analytics_dashboard(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    project_id: int | None = Query(default=None, gt=0),
    supplier_id: int | None = Query(default=None, gt=0),
    category_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*READ_ROLES)),
) -> dict:
    return _build_dashboard(db, user, start_date, end_date, project_id, supplier_id, category_id)


@router.get("/exports/spend.csv")
def export_spend_csv(
    group_by: Literal["month", "supplier", "project", "category", "item"] = Query(default="month"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    project_id: int | None = Query(default=None, gt=0),
    supplier_id: int | None = Query(default=None, gt=0),
    category_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*READ_ROLES)),
) -> StreamingResponse:
    _validate_dates(start_date, end_date)
    rows = _order_lines(db, user, start_date, end_date, project_id, supplier_id, category_id)
    totals: dict[str, dict] = defaultdict(lambda: {"value": ZERO, "quantity": ZERO, "orders": set()})
    for row in rows:
        if group_by == "month":
            label = row.order_date.strftime("%Y-%m") if row.order_date else "Undated"
        elif group_by == "supplier":
            label = row.supplier_name or "Unassigned"
        elif group_by == "project":
            label = row.project_name or "Unallocated"
        elif group_by == "category":
            label = row.category_name or "Uncategorized"
        else:
            label = row.item_name or row.description or "Unspecified"
        totals[label]["value"] += row.subtotal or ZERO
        totals[label]["quantity"] += row.quantity
        totals[label]["orders"].add(row.id)

    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow([group_by.replace("_", " ").title(), "PO Commitment (KES)", "Quantity", "Purchase Orders"])
    for label, values in sorted(totals.items(), key=lambda entry: entry[1]["value"], reverse=True):
        csv_label = label
        if csv_label.lstrip(" \t\r\n")[:1] in {"=", "+", "-", "@"}:
            csv_label = f"'{csv_label}"
        writer.writerow([
            csv_label,
            str(values["value"].quantize(CENT)),
            str(values["quantity"]),
            len(values["orders"]),
        ])
    content = io.BytesIO(("\ufeff" + output.getvalue()).encode("utf-8"))
    return StreamingResponse(
        content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="alwen-spend-by-{group_by}.csv"'},
    )
