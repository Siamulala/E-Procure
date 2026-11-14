import os
import uuid
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from alwen.auth import require_roles
from alwen.database import get_db
from alwen.models import (
    GoodsReceipt,
    GoodsReceiptLine,
    GoodsRejection,
    PurchaseOrder,
    PurchaseOrderLine,
    QuotationLine,
    Supplier,
    SupplierDocument,
    SupplierQuote,
    User,
    utc_now,
)
from alwen.schemas import GoodsRejectionInput
from alwen.time_utils import business_today


router = APIRouter(tags=["supplier onboarding"])
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
REQUIRED_DOCUMENTS = (
    "KRA PIN certificate",
    "Certificate of incorporation",
    "Tax compliance certificate",
    "Bank confirmation",
)
UPLOAD_ROOT = Path(os.getenv(
    "ALWEN_UPLOAD_DIR",
    str(Path(__file__).resolve().parents[1] / "uploads"),
)).resolve()
ALLOWED_FILES = {
    ".pdf": ("application/pdf", b"%PDF-"),
    ".jpg": ("image/jpeg", b"\xff\xd8\xff"),
    ".png": ("image/png", b"\x89PNG\r\n\x1a\n"),
}
SUPPLIER_WRITE_ROLES = ("Admin", "Procurement Officer", "Store Keeper")


def _active_supplier(db: Session, supplier_id: int) -> Supplier:
    supplier = db.get(Supplier, supplier_id)
    if supplier is None or supplier.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Supplier not found.")
    return supplier


def _validate_signature(extension: str, prefix: bytes) -> bool:
    _, signature = ALLOWED_FILES[extension]
    return prefix.startswith(signature)


async def _store_upload(upload: UploadFile, target_dir: Path) -> tuple[Path, str]:
    extension = Path(upload.filename or "").suffix.lower()
    expected_type = ALLOWED_FILES.get(extension)
    if expected_type is None or upload.content_type != expected_type[0]:
        raise HTTPException(status_code=415, detail="Only PDF, JPG and PNG files are accepted.")
    prefix = await upload.read(8)
    if not _validate_signature(extension, prefix):
        raise HTTPException(status_code=415, detail="The uploaded file content does not match its file type.")
    await upload.seek(0)
    target_dir.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{extension}"
    target = target_dir / name
    temporary = target.with_name(f"{target.name}.part")
    total = 0
    try:
        with temporary.open("xb") as destination:
            while chunk := await upload.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Uploads are limited to 10 MB.")
                destination.write(chunk)
        if total == 0:
            raise HTTPException(status_code=422, detail="The uploaded file is empty.")
        temporary.replace(target)
    except (OSError, HTTPException):
        temporary.unlink(missing_ok=True)
        raise
    return target, name


def _document_status(documents: list[SupplierDocument], today: date) -> dict:
    latest = {}
    for document in documents:
        current = latest.get(document.document_type)
        if current is None or document.created_at > current.created_at:
            latest[document.document_type] = document
    checklist = []
    for document_type in REQUIRED_DOCUMENTS:
        document = latest.get(document_type)
        expired = bool(document and document.expires_on and document.expires_on < today)
        expiring = bool(
            document
            and document.expires_on
            and today <= document.expires_on <= today + timedelta(days=30)
        )
        checklist.append({
            "document_type": document_type,
            "present": document is not None,
            "expired": expired,
            "expiring_within_30_days": expiring,
            "expires_on": document.expires_on.isoformat() if document and document.expires_on else None,
            "document_id": document.id if document else None,
        })
    return {"items": checklist, "compliant": all(
        entry["present"] and not entry["expired"] for entry in checklist
    )}


@router.post("/suppliers/{supplier_id}/documents", status_code=status.HTTP_201_CREATED)
async def upload_supplier_document(
    supplier_id: int,
    document_type: str,
    expires_on: date | None = None,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*SUPPLIER_WRITE_ROLES)),
) -> dict:
    _active_supplier(db, supplier_id)
    if document_type not in REQUIRED_DOCUMENTS:
        raise HTTPException(status_code=422, detail="Unknown supplier document type.")
    target, filename = await _store_upload(file, UPLOAD_ROOT / "suppliers" / str(supplier_id))
    relative_reference = str(target.relative_to(UPLOAD_ROOT))
    document = SupplierDocument(
        supplier_id=supplier_id,
        document_type=document_type,
        reference=relative_reference,
        expires_on=expires_on,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return {
        "id": document.id,
        "supplier_id": document.supplier_id,
        "document_type": document.document_type,
        "reference": document.reference,
        "expires_on": document.expires_on.isoformat() if document.expires_on else None,
        "filename": filename,
    }


@router.get("/suppliers/{supplier_id}/onboarding")
def supplier_onboarding(
    supplier_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("Admin", "Procurement Officer", "Approver", "Director", "Finance")),
) -> dict:
    supplier = _active_supplier(db, supplier_id)
    documents = db.scalars(
        select(SupplierDocument)
        .where(SupplierDocument.supplier_id == supplier_id)
        .order_by(SupplierDocument.created_at.desc())
    ).all()
    checklist = _document_status(documents, business_today())
    if supplier.status != "Suspended" and not checklist["compliant"]:
        supplier.status = "Suspended"
        db.commit()
    return {"supplier_id": supplier_id, "supplier_status": supplier.status, **checklist}


@router.post("/suppliers/{supplier_id}/reapprove")
def reapprove_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("Admin", "Approver", "Director")),
) -> dict:
    supplier = _active_supplier(db, supplier_id)
    documents = db.scalars(select(SupplierDocument).where(
        SupplierDocument.supplier_id == supplier_id
    )).all()
    checklist = _document_status(documents, business_today())
    if not checklist["compliant"]:
        raise HTTPException(status_code=409, detail="All required supplier documents must be valid before re-approval.")
    supplier.status = "Active"
    db.commit()
    return {"supplier_id": supplier.id, "status": supplier.status, "reapproved_by": user.id}


def recompute_supplier_score(db: Session, supplier: Supplier) -> dict:
    order_lines = db.execute(
        select(
            PurchaseOrder.id,
            PurchaseOrder.expected_delivery_date,
            PurchaseOrderLine.id.label("line_id"),
            PurchaseOrderLine.quantity,
        )
        .join(PurchaseOrderLine, PurchaseOrderLine.purchase_order_id == PurchaseOrder.id)
        .where(PurchaseOrder.supplier_id == supplier.id, PurchaseOrder.deleted_at.is_(None))
    ).all()
    total_ordered = sum((row.quantity for row in order_lines), Decimal("0"))
    total_received = Decimal("0")
    expected_orders = 0
    on_time_orders = 0
    max_received_by_order: dict[int, date] = {}
    for order_id, expected_date, line_id, _ in order_lines:
        receipt_rows = db.execute(
            select(GoodsReceipt.received_date, GoodsReceiptLine.quantity)
            .join(GoodsReceiptLine, GoodsReceiptLine.receipt_id == GoodsReceipt.id)
            .where(GoodsReceiptLine.purchase_order_line_id == line_id)
        ).all()
        line_received = sum((row.quantity for row in receipt_rows), Decimal("0"))
        total_received += line_received
        for received_date, _ in receipt_rows:
            previous = max_received_by_order.get(order_id)
            if previous is None or received_date > previous:
                max_received_by_order[order_id] = received_date
    order_dates = db.execute(
        select(PurchaseOrder.id, PurchaseOrder.expected_delivery_date)
        .where(PurchaseOrder.supplier_id == supplier.id, PurchaseOrder.deleted_at.is_(None))
    ).all()
    for order_id, expected_date in order_dates:
        if expected_date is None:
            continue
        expected_orders += 1
        last_received = max_received_by_order.get(order_id)
        if last_received is not None and last_received <= expected_date:
            on_time_orders += 1

    quotes = db.execute(
        select(SupplierQuote.supplier_id, QuotationLine.request_line_id, QuotationLine.rate)
        .join(QuotationLine, QuotationLine.quote_id == SupplierQuote.id)
    ).all()
    rates_by_line: dict[int, list[tuple[int, Decimal]]] = {}
    for supplier_id, line_id, rate in quotes:
        rates_by_line.setdefault(line_id, []).append((supplier_id, rate))
    supplier_quotes = 0
    supplier_wins = 0
    for entries in rates_by_line.values():
        for quoted_supplier_id, rate in entries:
            if quoted_supplier_id == supplier.id:
                supplier_quotes += 1
                if rate == min(value for _, value in entries):
                    supplier_wins += 1

    rejected_count = db.scalar(
        select(func.count()).select_from(GoodsRejection)
        .join(PurchaseOrder, PurchaseOrder.id == GoodsRejection.purchase_order_id)
        .where(PurchaseOrder.supplier_id == supplier.id)
    ) or 0
    on_time_rate = Decimal(on_time_orders) / expected_orders * 100 if expected_orders else Decimal("0")
    fill_rate = min(Decimal("100"), total_received / total_ordered * 100) if total_ordered else Decimal("0")
    price_rate = Decimal(supplier_wins) / supplier_quotes * 100 if supplier_quotes else Decimal("0")
    rejection_rate = max(Decimal("0"), Decimal("100") - Decimal(rejected_count * 10))
    score = (
        on_time_rate * Decimal("0.4")
        + fill_rate * Decimal("0.3")
        + price_rate * Decimal("0.2")
        + rejection_rate * Decimal("0.1")
    ).quantize(Decimal("0.01"))
    supplier.performance_score = score
    supplier.performance_score_updated_at = utc_now()
    return {
        "score": str(score),
        "components": {
            "on_time_delivery": str(on_time_rate.quantize(Decimal("0.01"))),
            "fill_rate": str(fill_rate.quantize(Decimal("0.01"))),
            "price_competitiveness": str(price_rate.quantize(Decimal("0.01"))),
            "rejected_goods": str(rejection_rate.quantize(Decimal("0.01"))),
        },
        "counts": {
            "orders_with_expected_date": expected_orders,
            "on_time_orders": on_time_orders,
            "ordered_quantity": str(total_ordered),
            "received_quantity": str(total_received),
            "quote_count": supplier_quotes,
            "lowest_quote_count": supplier_wins,
            "rejected_goods_count": rejected_count,
        },
    }


def recompute_all_supplier_scores(db: Session) -> int:
    suppliers = db.scalars(select(Supplier).where(
        Supplier.deleted_at.is_(None)
    )).all()
    for supplier in suppliers:
        recompute_supplier_score(db, supplier)
    db.commit()
    return len(suppliers)


def suspend_noncompliant_suppliers(db: Session) -> int:
    today = business_today()
    suppliers = db.scalars(select(Supplier).where(
        Supplier.deleted_at.is_(None),
        Supplier.status != "Suspended",
    )).all()
    suspended = 0
    for supplier in suppliers:
        documents = db.scalars(select(SupplierDocument).where(
            SupplierDocument.supplier_id == supplier.id
        )).all()
        if not _document_status(documents, today)["compliant"]:
            supplier.status = "Suspended"
            suspended += 1
    if suspended:
        db.commit()
    return suspended


@router.get("/suppliers/{supplier_id}/scorecard")
def supplier_scorecard(
    supplier_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("Admin", "Procurement Officer", "Approver", "Director", "Finance")),
) -> dict:
    supplier = _active_supplier(db, supplier_id)
    scorecard = recompute_supplier_score(db, supplier)
    db.commit()
    return {"supplier_id": supplier.id, "supplier": supplier.name, **scorecard}


@router.post("/orders/{order_id}/reject-goods", status_code=status.HTTP_201_CREATED)
def reject_goods(
    order_id: int,
    payload: GoodsRejectionInput,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*SUPPLIER_WRITE_ROLES)),
) -> dict:
    order = db.get(PurchaseOrder, order_id)
    if order is None or order.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Purchase order not found.")
    line = db.get(PurchaseOrderLine, payload.po_line_id)
    if line is None or line.purchase_order_id != order.id:
        raise HTTPException(status_code=422, detail="The selected purchase-order line does not belong to this order.")
    received = db.scalar(
        select(func.coalesce(func.sum(GoodsReceiptLine.quantity), 0))
        .where(GoodsReceiptLine.purchase_order_line_id == line.id)
    ) or Decimal("0")
    rejected = db.scalar(
        select(func.coalesce(func.sum(GoodsRejection.quantity), 0))
        .where(GoodsRejection.purchase_order_line_id == line.id)
    ) or Decimal("0")
    if received + rejected + payload.quantity > line.quantity:
        raise HTTPException(status_code=409, detail="Rejected quantity exceeds the unreceived ordered quantity.")
    rejection = GoodsRejection(
        purchase_order_id=order.id,
        purchase_order_line_id=line.id,
        quantity=payload.quantity,
        reason=payload.reason.strip(),
        rejected_by_id=user.id,
    )
    db.add(rejection)
    db.commit()
    db.refresh(rejection)
    return {
        "id": rejection.id,
        "purchase_order_id": order.id,
        "purchase_order_line_id": line.id,
        "quantity": str(rejection.quantity),
        "reason": rejection.reason,
        "stock_movement_created": False,
    }
