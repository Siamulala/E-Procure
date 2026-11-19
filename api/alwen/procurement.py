from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from alwen.audit import write_audit
from alwen.auth import get_current_user, require_roles
from alwen.database import get_db
from alwen.models import (
    Approval,
    ApprovalDelegation,
    ApprovalStep,
    Contract,
    ContractLine,
    Item,
    Project,
    ProjectMonthlyBudget,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseRequest,
    PurchaseRequestLine,
    QuotationLine,
    RequestStatus,
    Supplier,
    SupplierQuote,
    Unit,
    User,
    utc_now,
)
from alwen.notifications import notify_requester, notify_role
from alwen.schemas import DecisionInput, PurchaseRequestInput
from alwen.time_utils import business_today


router = APIRouter(tags=["procurement"])
MONEY_QUANTUM = Decimal("0.01")
WRITE_ROLES = ("Admin", "Procurement Officer")
APPROVER_ROLES = ("Admin", "Approver", "Director")
READ_ROLES = ("Admin", "Procurement Officer", "Approver", "Director", "Store Keeper", "Project Manager", "Finance")


def _audit(
    db: Session,
    user: User,
    action: str,
    entity_type: str,
    entity_id: int,
    before: dict | None = None,
    after: dict | None = None,
) -> None:
    write_audit(db, user, action, entity_type, entity_id, before, after)


def _active_entity(db: Session, model, entity_id: int, name: str):
    row = db.get(model, entity_id)
    if row is None or (hasattr(row, "deleted_at") and row.deleted_at is not None):
        raise HTTPException(status_code=422, detail=f"{name} {entity_id} does not exist or is inactive.")
    if isinstance(row, Supplier) and row.status == "Suspended":
        raise HTTPException(status_code=422, detail=f"Supplier {entity_id} is suspended pending compliance re-approval.")
    return row


def _validate_request_references(db: Session, payload: PurchaseRequestInput) -> None:
    if payload.project_id is not None:
        _active_entity(db, Project, payload.project_id, "Project")
    for line in payload.lines:
        if line.item_id is not None:
            _active_entity(db, Item, line.item_id, "Item")
        if line.unit_id is not None:
            _active_entity(db, Unit, line.unit_id, "Unit")
        if line.proposed_supplier_id is not None:
            _active_entity(db, Supplier, line.proposed_supplier_id, "Supplier")
        if line.contract_line_id is not None:
            contract_line = db.get(ContractLine, line.contract_line_id)
            contract = db.get(Contract, contract_line.contract_id) if contract_line else None
            today = business_today()
            if (
                contract is None
                or contract.deleted_at is not None
                or contract.status != "active"
                or not contract.start_date <= today <= contract.end_date
            ):
                raise HTTPException(status_code=422, detail="The selected contract line is not currently active.")
            if line.proposed_supplier_id is not None and line.proposed_supplier_id != contract.supplier_id:
                raise HTTPException(status_code=422, detail="The contract supplier must match the proposed supplier.")
    seen_suppliers: set[int] = set()
    for quote in payload.quotes:
        _active_entity(db, Supplier, quote.supplier_id, "Supplier")
        if quote.supplier_id in seen_suppliers:
            raise HTTPException(status_code=422, detail="A supplier may appear only once in a request's quote list.")
        seen_suppliers.add(quote.supplier_id)
        seen_lines: set[int] = set()
        for quote_line in quote.lines:
            if quote_line.line_index >= len(payload.lines):
                raise HTTPException(status_code=422, detail="Quote line refers to a request line that does not exist.")
            if quote_line.line_index in seen_lines:
                raise HTTPException(status_code=422, detail="Quote contains duplicate request-line entries.")
            seen_lines.add(quote_line.line_index)


def _replace_request_lines(db: Session, request: PurchaseRequest, payload: PurchaseRequestInput) -> None:
    line_ids = list(db.scalars(
        select(PurchaseRequestLine.id).where(PurchaseRequestLine.request_id == request.id)
    ))
    if line_ids:
        db.execute(delete(QuotationLine).where(QuotationLine.request_line_id.in_(line_ids)))
    db.execute(delete(SupplierQuote).where(SupplierQuote.request_id == request.id))
    db.execute(delete(PurchaseRequestLine).where(PurchaseRequestLine.request_id == request.id))

    lines = []
    for line_input in payload.lines:
        line = PurchaseRequestLine(
            request_id=request.id,
            item_id=line_input.item_id,
            description=line_input.description.strip(),
            quantity=line_input.quantity,
            unit_id=line_input.unit_id,
            proposed_supplier_id=line_input.proposed_supplier_id,
            proposed_supplier_reason=line_input.proposed_supplier_reason,
            contract_line_id=line_input.contract_line_id,
        )
        db.add(line)
        lines.append(line)
    db.flush()

    for quote_input in payload.quotes:
        quote = SupplierQuote(
            request_id=request.id,
            supplier_id=quote_input.supplier_id,
            quote_reference=quote_input.reference,
            quote_date=quote_input.quote_date,
        )
        db.add(quote)
        db.flush()
        for quote_line in quote_input.lines:
            request_line = lines[quote_line.line_index]
            amount = (request_line.quantity * quote_line.rate).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
            db.add(QuotationLine(
                quote_id=quote.id,
                request_line_id=request_line.id,
                rate=quote_line.rate,
                amount=amount,
            ))


def _request_data(db: Session, request: PurchaseRequest) -> dict:
    lines = list(db.scalars(
        select(PurchaseRequestLine).where(PurchaseRequestLine.request_id == request.id).order_by(PurchaseRequestLine.id)
    ))
    line_data = []
    for line in lines:
        quotes = db.execute(
            select(SupplierQuote.supplier_id, Supplier.name, SupplierQuote.quote_reference,
                   SupplierQuote.quote_date, QuotationLine.rate, QuotationLine.amount)
            .join(QuotationLine, QuotationLine.quote_id == SupplierQuote.id)
            .join(Supplier, Supplier.id == SupplierQuote.supplier_id)
            .where(
                SupplierQuote.request_id == request.id,
                QuotationLine.request_line_id == line.id,
            )
        ).all()
        lowest_rate = min((row.rate for row in quotes), default=None)
        line_data.append({
            "id": line.id,
            "item_id": line.item_id,
            "description": line.description,
            "quantity": str(line.quantity),
            "unit_id": line.unit_id,
            "proposed_supplier_id": line.proposed_supplier_id,
            "proposed_supplier_reason": line.proposed_supplier_reason,
            "contract_line_id": line.contract_line_id,
            "quotes": [{
                "supplier_id": row.supplier_id,
                "supplier": row.name,
                "reference": row.quote_reference,
                "quote_date": row.quote_date.isoformat() if row.quote_date else None,
                "rate": str(row.rate),
                "amount": str(row.amount),
                "is_lowest": row.rate == lowest_rate,
            } for row in quotes],
        })
    approvals = db.scalars(
        select(Approval).where(Approval.request_id == request.id).order_by(Approval.decided_at, Approval.id)
    ).all()
    return {
        "id": request.id,
        "request_number": request.request_number,
        "request_date": request.request_date.isoformat() if request.request_date else None,
        "required_by": request.required_by.isoformat() if request.required_by else None,
        "project_id": request.project_id,
        "created_by_id": request.created_by_id,
        "status": request.status,
        "budget_override_reason": request.budget_override_reason,
        "lines": line_data,
        "approvals": [{
            "user_id": approval.user_id,
            "decision": approval.decision,
            "comments": approval.comments,
            "decided_at": approval.decided_at.isoformat(),
        } for approval in approvals],
    }


def _order_data(db: Session, order: PurchaseOrder) -> dict:
    lines = list(db.scalars(
        select(PurchaseOrderLine).where(PurchaseOrderLine.purchase_order_id == order.id)
    ))
    return {
        "id": order.id,
        "order_number": order.order_number,
        "supplier_id": order.supplier_id,
        "request_id": order.request_id,
        "project_id": order.project_id,
        "order_date": order.order_date.isoformat() if order.order_date else None,
        "expected_delivery_date": order.expected_delivery_date.isoformat() if order.expected_delivery_date else None,
        "delivery_status": order.delivery_status,
        "lines": [{
            "id": line.id,
            "request_line_id": line.request_line_id,
            "item_id": line.item_id,
            "description": line.description,
            "quantity": str(line.quantity),
            "unit_price": str(line.unit_price),
            "subtotal": str(line.subtotal),
        } for line in lines],
    }


def _check_project_scope(row_project_id: int | None, user: User) -> None:
    if user.role == "Project Manager" and row_project_id != user.project_id:
        raise HTTPException(status_code=404, detail="Record not found.")


@router.post("/purchase-requests", status_code=status.HTTP_201_CREATED)
def create_purchase_request(
    payload: PurchaseRequestInput,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE_ROLES)),
) -> dict:
    _validate_request_references(db, payload)
    request = PurchaseRequest(
        request_number=f"TEMP-{uuid4().hex}",
        request_date=payload.request_date,
        required_by=payload.required_by,
        project_id=payload.project_id,
        budget_override_reason=payload.budget_override_reason.strip() if payload.budget_override_reason else None,
        created_by_id=user.id,
        status=RequestStatus.DRAFT.value,
    )
    db.add(request)
    db.flush()
    request.request_number = f"PR-{payload.request_date.year}-{request.id:06d}"
    _replace_request_lines(db, request, payload)
    _audit(db, user, "create", "purchase_request", request.id, after={"status": request.status})
    db.commit()
    db.refresh(request)
    return _request_data(db, request)


@router.put("/purchase-requests/{request_id}")
def update_purchase_request(
    request_id: int,
    payload: PurchaseRequestInput,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE_ROLES)),
) -> dict:
    request = db.get(PurchaseRequest, request_id)
    if request is None or request.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Purchase request not found.")
    if request.status != RequestStatus.DRAFT.value:
        raise HTTPException(status_code=409, detail="Only draft purchase requests can be edited.")
    _validate_request_references(db, payload)
    before = _request_data(db, request)
    request.request_date = payload.request_date
    request.required_by = payload.required_by
    request.project_id = payload.project_id
    request.budget_override_reason = payload.budget_override_reason.strip() if payload.budget_override_reason else None
    _replace_request_lines(db, request, payload)
    _audit(db, user, "update", "purchase_request", request.id, before=before, after={"status": request.status})
    db.commit()
    db.refresh(request)
    return _request_data(db, request)


@router.get("/purchase-requests")
def list_purchase_requests(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    request_status: str | None = Query(default=None, alias="status", max_length=32),
    search: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*READ_ROLES)),
) -> dict:
    statement = select(PurchaseRequest).where(PurchaseRequest.deleted_at.is_(None))
    if request_status:
        statement = statement.where(PurchaseRequest.status == request_status)
    if search:
        statement = statement.where(PurchaseRequest.request_number.ilike(f"%{search.strip()}%"))
    if user.role == "Project Manager":
        statement = statement.where(PurchaseRequest.project_id == user.project_id)
    count = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    rows = db.scalars(statement.order_by(PurchaseRequest.id.desc()).offset(offset).limit(limit)).all()
    return {"items": [_request_data(db, row) for row in rows], "total": count, "offset": offset, "limit": limit}


@router.get("/purchase-requests/{request_id}")
def get_purchase_request(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*READ_ROLES)),
) -> dict:
    request = db.get(PurchaseRequest, request_id)
    if request is None or request.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Purchase request not found.")
    _check_project_scope(request.project_id, user)
    return _request_data(db, request)


@router.post("/purchase-requests/{request_id}/submit")
def submit_purchase_request(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE_ROLES)),
) -> dict:
    request = db.get(PurchaseRequest, request_id)
    if request is None or request.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Purchase request not found.")
    if request.status != RequestStatus.DRAFT.value:
        raise HTTPException(status_code=409, detail="Only draft purchase requests can be submitted.")
    if db.scalar(select(func.count()).select_from(PurchaseRequestLine).where(PurchaseRequestLine.request_id == request.id)) == 0:
        raise HTTPException(status_code=409, detail="A purchase request must contain at least one line.")
    project = db.get(Project, request.project_id) if request.project_id is not None else None
    project_monthly_budget_count = 0
    monthly_budget = None
    if project is not None:
        project_monthly_budget_count = db.scalar(
            select(func.count()).select_from(ProjectMonthlyBudget).where(
                ProjectMonthlyBudget.project_id == project.id
            )
        ) or 0
        if request.required_by is not None:
            monthly_budget = db.scalar(select(ProjectMonthlyBudget).where(
                ProjectMonthlyBudget.project_id == project.id,
                ProjectMonthlyBudget.year == request.required_by.year,
                ProjectMonthlyBudget.month == request.required_by.month,
            ))
    has_budget = project is not None and (project.budget is not None or project_monthly_budget_count > 0)
    budget_exceeded = False
    if project_monthly_budget_count and request.required_by is None:
        raise HTTPException(status_code=422, detail="required_by is required when monthly project budgets are configured.")
    if has_budget:
        requested_amount = Decimal("0")
        lines = db.scalars(
            select(PurchaseRequestLine).where(PurchaseRequestLine.request_id == request.id)
        ).all()
        for line in lines:
            if line.contract_line_id is not None:
                contract_line = db.get(ContractLine, line.contract_line_id)
                rate = contract_line.agreed_price if contract_line else None
                if rate is None:
                    raise HTTPException(status_code=409, detail=f"Contract line {line.contract_line_id} is unavailable.")
                requested_amount += line.quantity * rate
                continue
            quoted_rates = db.execute(
                select(SupplierQuote.supplier_id, QuotationLine.rate)
                .join(QuotationLine, QuotationLine.quote_id == SupplierQuote.id)
                .where(
                    SupplierQuote.request_id == request.id,
                    QuotationLine.request_line_id == line.id,
                )
            ).all()
            rate = next(
                (quote_rate for supplier_id, quote_rate in quoted_rates if supplier_id == line.proposed_supplier_id),
                min((quote_rate for _, quote_rate in quoted_rates), default=None),
            )
            if rate is None:
                raise HTTPException(
                    status_code=409,
                    detail="A quote is required for every line before submitting a budget-controlled request.",
                )
            requested_amount += line.quantity * rate

        committed_total = db.scalar(
            select(func.coalesce(func.sum(PurchaseOrderLine.subtotal), 0))
            .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.purchase_order_id)
            .where(PurchaseOrder.project_id == project.id, PurchaseOrder.deleted_at.is_(None))
        ) or Decimal("0")
        if project.budget is not None and committed_total + requested_amount > project.budget:
            budget_exceeded = True
        if monthly_budget is not None:
            month_start = date(request.required_by.year, request.required_by.month, 1)
            month_end = date(
                request.required_by.year + (request.required_by.month == 12),
                request.required_by.month % 12 + 1,
                1,
            )
            monthly_committed = db.scalar(
                select(func.coalesce(func.sum(PurchaseOrderLine.subtotal), 0))
                .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.purchase_order_id)
                .where(
                    PurchaseOrder.project_id == project.id,
                    PurchaseOrder.deleted_at.is_(None),
                    PurchaseOrder.order_date >= month_start,
                    PurchaseOrder.order_date < month_end,
                )
            ) or Decimal("0")
            if monthly_committed + requested_amount > monthly_budget.amount:
                budget_exceeded = True
    if budget_exceeded and not request.budget_override_reason:
        raise HTTPException(
            status_code=409,
            detail="This request exceeds the project budget. Add a budget_override_reason to request director approval.",
        )
    before = {"status": request.status}
    request.status = RequestStatus.SUBMITTED.value
    db.add(ApprovalStep(
        request_id=request.id,
        required_role="Director" if budget_exceeded else "Approver",
        status="Pending",
    ))
    _audit(db, user, "submit", "purchase_request", request.id, before=before, after={"status": request.status})
    db.commit()
    db.refresh(request)
    step_role = "Director" if budget_exceeded else "Approver"
    notify_role(
        db,
        step_role,
        kind="approval_required",
        title=f"Approval required: {request.request_number}",
        message=f"Purchase request {request.request_number} is awaiting {step_role.lower()} approval.",
    )
    return _request_data(db, request)


@router.post("/purchase-requests/{request_id}/decision")
def decide_purchase_request(
    request_id: int,
    payload: DecisionInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    request = db.get(PurchaseRequest, request_id)
    if request is None or request.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Purchase request not found.")
    if request.status != RequestStatus.SUBMITTED.value:
        raise HTTPException(status_code=409, detail="Only submitted purchase requests can be approved or rejected.")
    if payload.decision == "Rejected" and not (payload.comments and payload.comments.strip()):
        raise HTTPException(status_code=422, detail="A rejection comment is required.")
    step = db.scalar(
        select(ApprovalStep)
        .where(ApprovalStep.request_id == request.id, ApprovalStep.status == "Pending")
        .order_by(ApprovalStep.id.desc())
    )
    required_role = step.required_role if step is not None else "Approver"
    if user.role not in ("Admin", required_role):
        now = datetime.now(timezone.utc)
        delegation_id = db.scalar(
            select(ApprovalDelegation.id)
            .join(User, User.id == ApprovalDelegation.delegator_user_id)
            .where(
                ApprovalDelegation.delegate_user_id == user.id,
                ApprovalDelegation.is_active.is_(True),
                ApprovalDelegation.starts_at <= now,
                ApprovalDelegation.ends_at >= now,
                User.role == required_role,
                User.is_active.is_(True),
            )
        )
        if delegation_id is None:
            raise HTTPException(status_code=403, detail=f"This request requires approval by a {required_role}.")
    previous_status = request.status
    request.status = RequestStatus(payload.decision).value
    db.add(Approval(
        request_id=request.id,
        user_id=user.id,
        decision=payload.decision,
        comments="; ".join(filter(None, [
            payload.comments.strip() if payload.comments else None,
            f"Budget override: {request.budget_override_reason}" if request.budget_override_reason else None,
        ])) or None,
        decided_at=utc_now(),
    ))
    if step is not None:
        step.status = payload.decision
        step.decision = payload.decision
        step.comments = payload.comments.strip() if payload.comments else None
        step.decided_by_id = user.id
        step.decided_at = utc_now()
    _audit(
        db, user, payload.decision.lower(), "purchase_request", request.id,
        before={"status": previous_status},
        after={"status": request.status, "comments": payload.comments, "budget_override_reason": request.budget_override_reason},
    )
    db.commit()
    db.refresh(request)
    notify_requester(
        db,
        request.id,
        request.created_by_id,
        kind="request_decision",
        title=f"Request {request.status.lower()}: {request.request_number}",
        message=f"Your purchase request {request.request_number} was {request.status.lower()}.",
    )
    return _request_data(db, request)


@router.post("/purchase-requests/{request_id}/convert-to-orders", status_code=status.HTTP_201_CREATED)
def convert_request_to_orders(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE_ROLES)),
) -> dict:
    request = db.get(PurchaseRequest, request_id)
    if request is None or request.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Purchase request not found.")
    if request.status != RequestStatus.APPROVED.value:
        raise HTTPException(status_code=409, detail="Only approved purchase requests can be converted.")

    lines = list(db.scalars(
        select(PurchaseRequestLine).where(PurchaseRequestLine.request_id == request.id).order_by(PurchaseRequestLine.id)
    ))
    grouped: dict[int, list[tuple[PurchaseRequestLine, Decimal]]] = {}
    contract_lines: list[tuple[ContractLine, Decimal]] = []
    for line in lines:
        supplier_id = line.proposed_supplier_id
        if line.contract_line_id is not None:
            contract_line = db.scalar(
                select(ContractLine).where(ContractLine.id == line.contract_line_id).with_for_update()
            )
            contract = db.get(Contract, contract_line.contract_id) if contract_line else None
            if (
                contract is None
                or contract.deleted_at is not None
                or contract.status != "active"
                or not contract.start_date <= business_today() <= contract.end_date
            ):
                raise HTTPException(status_code=409, detail=f"Contract line for request line {line.id} is no longer active.")
            if supplier_id is not None and supplier_id != contract.supplier_id:
                raise HTTPException(status_code=409, detail="The contract supplier does not match the proposed supplier.")
            supplier_id = contract.supplier_id
            if contract_line.max_quantity is not None and (
                contract_line.called_off_quantity + line.quantity > contract_line.max_quantity
            ):
                raise HTTPException(status_code=409, detail=f"Contract line {contract_line.id} quantity limit would be exceeded.")
            contract_lines.append((contract_line, line.quantity))
            grouped.setdefault(supplier_id, []).append((line, contract_line.agreed_price))
            continue
        if supplier_id is None:
            raise HTTPException(status_code=409, detail=f"Request line {line.id} has no proposed supplier.")
        rate = db.scalar(
            select(QuotationLine.rate)
            .join(SupplierQuote, SupplierQuote.id == QuotationLine.quote_id)
            .where(
                SupplierQuote.request_id == request.id,
                SupplierQuote.supplier_id == supplier_id,
                QuotationLine.request_line_id == line.id,
            )
        )
        if rate is None:
            raise HTTPException(status_code=409, detail=f"Request line {line.id} has no quote from its proposed supplier.")
        grouped.setdefault(supplier_id, []).append((line, rate))

    orders = []
    for supplier_id, supplier_lines in grouped.items():
        order = PurchaseOrder(
            order_number=f"TEMP-{uuid4().hex}",
            supplier_id=supplier_id,
            request_id=request.id,
            project_id=request.project_id,
            order_date=business_today(),
        )
        db.add(order)
        db.flush()
        order.order_number = f"PO:{order.id:03d}"
        for request_line, rate in supplier_lines:
            subtotal = (request_line.quantity * rate).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
            db.add(PurchaseOrderLine(
                purchase_order_id=order.id,
                request_line_id=request_line.id,
                item_id=request_line.item_id,
                contract_line_id=request_line.contract_line_id,
                description=request_line.description,
                quantity=request_line.quantity,
                unit_price=rate,
                subtotal=subtotal,
            ))
        orders.append(order)

    for contract_line, quantity in contract_lines:
        contract_line.called_off_quantity += quantity
    request.status = RequestStatus.CONVERTED.value
    _audit(
        db, user, "convert", "purchase_request", request.id,
        before={"status": RequestStatus.APPROVED.value},
        after={"status": request.status, "purchase_order_ids": [order.id for order in orders]},
    )
    db.commit()
    return {"purchase_request": _request_data(db, request), "purchase_orders": [_order_data(db, row) for row in orders]}


@router.get("/purchase-orders")
def list_purchase_orders(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    delivery_status: str | None = Query(default=None, alias="status", max_length=32),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*READ_ROLES)),
) -> dict:
    statement = select(PurchaseOrder).where(PurchaseOrder.deleted_at.is_(None))
    if delivery_status:
        statement = statement.where(PurchaseOrder.delivery_status == delivery_status)
    if user.role == "Project Manager":
        statement = statement.where(PurchaseOrder.project_id == user.project_id)
    count = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    rows = db.scalars(statement.order_by(PurchaseOrder.id.desc()).offset(offset).limit(limit)).all()
    return {"items": [_order_data(db, row) for row in rows], "total": count, "offset": offset, "limit": limit}


@router.get("/purchase-orders/{order_id}")
def get_purchase_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*READ_ROLES)),
) -> dict:
    order = db.get(PurchaseOrder, order_id)
    if order is None or order.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Purchase order not found.")
    _check_project_scope(order.project_id, user)
    return _order_data(db, order)
