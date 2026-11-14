import os
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from alwen.auth import get_current_user, require_roles
from alwen.database import get_db
from alwen.models import (
    ApprovalDelegation,
    ApprovalStep,
    Contract,
    GoodsReceipt,
    GoodsReceiptLine,
    Project,
    ProjectMonthlyBudget,
    PurchaseOrder,
    PurchaseOrderLine,
    SupplierInvoice,
    SystemAlert,
    User,
    utc_now,
)
from alwen.notifications import notify_role
from alwen.schemas import ApprovalDelegationInput, ProjectMonthlyBudgetInput
from alwen.time_utils import business_today


router = APIRouter(tags=["budgets and controls"])
MONEY_ZERO = Decimal("0")
ADMIN_FINANCE = ("Admin", "Finance")
APPROVAL_ROLES = ("Admin", "Approver", "Director")


@router.put("/projects/{project_id}/monthly-budgets/{year}/{month}")
def set_monthly_budget(
    project_id: int,
    year: int,
    month: int,
    payload: ProjectMonthlyBudgetInput,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*ADMIN_FINANCE)),
) -> dict:
    if not 1 <= month <= 12 or not 2000 <= year <= 9999:
        raise HTTPException(status_code=422, detail="A valid year and month are required.")
    project = db.get(Project, project_id)
    if project is None or project.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found.")
    budget = db.scalar(select(ProjectMonthlyBudget).where(
        ProjectMonthlyBudget.project_id == project_id,
        ProjectMonthlyBudget.year == year,
        ProjectMonthlyBudget.month == month,
    ))
    if budget is None:
        budget = ProjectMonthlyBudget(
            project_id=project_id,
            year=year,
            month=month,
            amount=payload.amount,
        )
        db.add(budget)
    else:
        budget.amount = payload.amount
    db.commit()
    db.refresh(budget)
    return {
        "id": budget.id,
        "project_id": budget.project_id,
        "year": budget.year,
        "month": budget.month,
        "amount": str(budget.amount),
    }


@router.post("/approval-delegations", status_code=201)
def create_approval_delegation(
    payload: ApprovalDelegationInput,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*APPROVAL_ROLES)),
) -> dict:
    starts_at = payload.starts_at
    ends_at = payload.ends_at
    if starts_at.tzinfo is None or ends_at.tzinfo is None:
        raise HTTPException(status_code=422, detail="Delegation timestamps must include a timezone.")
    starts_at = starts_at.astimezone(timezone.utc)
    ends_at = ends_at.astimezone(timezone.utc)
    if starts_at >= ends_at:
        raise HTTPException(status_code=422, detail="The delegation start must be before its end.")
    if payload.delegate_user_id == user.id:
        raise HTTPException(status_code=422, detail="You cannot delegate approval to yourself.")
    delegate = db.get(User, payload.delegate_user_id)
    if delegate is None or not delegate.is_active or delegate.deleted_at is not None:
        raise HTTPException(status_code=422, detail="The delegate must be an active user.")
    delegation = ApprovalDelegation(
        delegator_user_id=user.id,
        delegate_user_id=delegate.id,
        starts_at=starts_at,
        ends_at=ends_at,
    )
    db.add(delegation)
    db.commit()
    db.refresh(delegation)
    return {
        "id": delegation.id,
        "delegator_user_id": delegation.delegator_user_id,
        "delegate_user_id": delegation.delegate_user_id,
        "starts_at": delegation.starts_at.isoformat(),
        "ends_at": delegation.ends_at.isoformat(),
    }


@router.get("/reports/budget-vs-actual")
def budget_vs_actual(
    year: int = Query(ge=2000, le=9999),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    projects = db.scalars(select(Project).where(Project.deleted_at.is_(None)).order_by(Project.name)).all()
    budgets = db.scalars(select(ProjectMonthlyBudget).where(ProjectMonthlyBudget.year == year)).all()
    rows = {
        (project.id, month): {
            "project_id": project.id,
            "project": project.name,
            "year": year,
            "month": month,
            "budget": MONEY_ZERO,
            "committed": MONEY_ZERO,
            "received_value": MONEY_ZERO,
            "invoiced_net": MONEY_ZERO,
        }
        for project in projects
        if user.role != "Project Manager" or project.id == user.project_id
        for month in range(1, 13)
    }
    for budget in budgets:
        row = rows.get((budget.project_id, budget.month))
        if row is not None:
            row["budget"] += budget.amount

    orders = db.execute(
        select(PurchaseOrder.project_id, PurchaseOrder.order_date, PurchaseOrderLine.subtotal)
        .join(PurchaseOrderLine, PurchaseOrderLine.purchase_order_id == PurchaseOrder.id)
        .where(
            PurchaseOrder.order_date >= date(year, 1, 1),
            PurchaseOrder.order_date < date(year + 1, 1, 1),
            PurchaseOrder.deleted_at.is_(None),
        )
    ).all()
    for project_id, order_date, subtotal in orders:
        row = rows.get((project_id, order_date.month)) if order_date is not None else None
        if row is not None:
            row["committed"] += subtotal

    receipts = db.execute(
        select(GoodsReceipt.project_id, GoodsReceipt.received_date, GoodsReceiptLine.quantity, GoodsReceiptLine.unit_cost)
        .join(GoodsReceiptLine, GoodsReceiptLine.receipt_id == GoodsReceipt.id)
        .where(
            GoodsReceipt.received_date >= date(year, 1, 1),
            GoodsReceipt.received_date < date(year + 1, 1, 1),
        )
    ).all()
    for project_id, received_date, quantity, unit_cost in receipts:
        row = rows.get((project_id, received_date.month))
        if row is not None:
            row["received_value"] += quantity * unit_cost

    invoices = db.execute(
        select(
            PurchaseOrder.project_id,
            SupplierInvoice.invoice_date,
            SupplierInvoice.total_amount,
            SupplierInvoice.net_amount,
            SupplierInvoice.vat_amount,
        )
        .join(PurchaseOrder, PurchaseOrder.id == SupplierInvoice.purchase_order_id)
        .where(
            SupplierInvoice.invoice_date >= date(year, 1, 1),
            SupplierInvoice.invoice_date < date(year + 1, 1, 1),
            SupplierInvoice.deleted_at.is_(None),
        )
    ).all()
    for project_id, invoice_date, total_amount, net_amount, vat_amount in invoices:
        row = rows.get((project_id, invoice_date.month)) if invoice_date is not None else None
        if row is not None:
            row["invoiced_net"] += net_amount if net_amount is not None else total_amount - vat_amount

    items = []
    for row in rows.values():
        items.append({
            "project_id": row["project_id"],
            "project": row["project"],
            "year": row["year"],
            "month": row["month"],
            "budget": str(row["budget"].quantize(Decimal("0.01"))),
            "committed": str(row["committed"].quantize(Decimal("0.01"))),
            "received_value": str(row["received_value"].quantize(Decimal("0.01"))),
            "invoiced_net": str(row["invoiced_net"].quantize(Decimal("0.01"))),
        })
    return {"year": year, "items": items}


def run_alerts(db: Session, *, today: date | None = None) -> int:
    business_day = today or business_today()
    try:
        escalation_days = max(1, int(os.getenv("ALWEN_APPROVAL_ESCALATION_DAYS", "5")))
    except ValueError as error:
        raise RuntimeError("ALWEN_APPROVAL_ESCALATION_DAYS must be a positive integer.") from error
    cutoff = datetime.combine(
        business_day - timedelta(days=escalation_days),
        datetime.min.time(),
        tzinfo=timezone.utc,
    )
    stale_steps = db.scalars(
        select(ApprovalStep).where(
            ApprovalStep.status == "Pending",
            ApprovalStep.created_at <= cutoff,
        )
    ).all()
    created = 0
    outgoing_notifications: list[tuple[str, str, str, str]] = []
    for step in stale_steps:
        exists = db.scalar(select(SystemAlert.id).where(
            SystemAlert.alert_type == "approval_escalation",
            SystemAlert.entity_type == "approval_step",
            SystemAlert.entity_id == str(step.id),
            SystemAlert.resolved_at.is_(None),
        ))
        if exists is None:
            db.add(SystemAlert(
                alert_type="approval_escalation",
                entity_type="approval_step",
                entity_id=str(step.id),
                message=f"Approval step {step.id} for purchase request {step.request_id} has been pending for at least {escalation_days} days.",
            ))
            created += 1
            outgoing_notifications.append((
                step.required_role,
                "Approval escalation",
                f"Approval step {step.id} for purchase request {step.request_id} is overdue.",
                "approval_escalation",
            ))
    expired_contracts = db.scalars(select(Contract).where(
        Contract.deleted_at.is_(None),
        Contract.status == "active",
        Contract.end_date < business_day,
    )).all()
    for contract in expired_contracts:
        contract.status = "expired"
    contracts = db.scalars(
        select(Contract).where(
            Contract.deleted_at.is_(None),
            Contract.status == "active",
            Contract.end_date >= business_day,
            Contract.end_date <= business_day + timedelta(days=60),
        )
    ).all()
    for contract in contracts:
        days_remaining = (contract.end_date - business_day).days
        if days_remaining not in (60, 30, 7):
            continue
        exists = db.scalar(select(SystemAlert.id).where(
            SystemAlert.alert_type == "contract_expiry",
            SystemAlert.entity_type == "contract",
            SystemAlert.entity_id == str(contract.id),
            SystemAlert.message.like(f"%{days_remaining} days%"),
            SystemAlert.resolved_at.is_(None),
        ))
        if exists is None:
            db.add(SystemAlert(
                alert_type="contract_expiry",
                entity_type="contract",
                entity_id=str(contract.id),
                message=f"Contract {contract.contract_number} expires in {days_remaining} days.",
            ))
            created += 1
            outgoing_notifications.append((
                "Procurement Officer",
                "Contract expiry reminder",
                f"Contract {contract.contract_number} expires in {days_remaining} days.",
                "contract_expiry",
            ))
    db.commit()
    for role, title, message, kind in outgoing_notifications:
        notify_role(db, role, kind=kind, title=title, message=message)
    return created


@router.post("/reports/alerts/run")
def run_alert_job(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("Admin")),
) -> dict:
    return {"created": run_alerts(db)}


@router.get("/reports/alerts")
def list_alerts(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("Admin", "Approver", "Director", "Finance")),
) -> dict:
    alerts = db.scalars(
        select(SystemAlert)
        .where(SystemAlert.resolved_at.is_(None))
        .order_by(SystemAlert.created_at.desc(), SystemAlert.id.desc())
    ).all()
    return {"items": [{
        "id": alert.id,
        "type": alert.alert_type,
        "entity_type": alert.entity_type,
        "entity_id": alert.entity_id,
        "message": alert.message,
        "created_at": alert.created_at.isoformat(),
    } for alert in alerts]}
