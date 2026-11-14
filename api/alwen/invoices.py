from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from alwen.auth import require_roles
from alwen.database import get_db
from alwen.models import (
    BillPayment,
    GoodsReceiptLine,
    Item,
    PaymentMethod,
    PurchaseOrder,
    PurchaseOrderLine,
    Supplier,
    SupplierInvoice,
    SupplierInvoiceLine,
    TaxSetting,
    User,
)
from alwen.schemas import BillPaymentInput, SupplierInvoiceInput, TaxSettingsInput


router = APIRouter(tags=["invoices and tax"])
CENT = Decimal("0.01")
READ_ROLES = ("Admin", "Procurement Officer", "Approver", "Director", "Finance")


def _money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def _tax_settings(db: Session) -> TaxSetting:
    setting = db.scalar(
        select(TaxSetting).where(TaxSetting.is_active.is_(True)).order_by(TaxSetting.id.desc())
    )
    if setting is None:
        setting = TaxSetting(vat_rate=Decimal("0.16"), wht_rates={})
        db.add(setting)
        db.flush()
    return setting


def _invoice_data(db: Session, invoice: SupplierInvoice) -> dict:
    supplier = db.get(Supplier, invoice.supplier_id)
    lines = db.scalars(
        select(SupplierInvoiceLine).where(SupplierInvoiceLine.invoice_id == invoice.id)
    ).all()
    payments = db.scalars(
        select(BillPayment).where(BillPayment.invoice_id == invoice.id).order_by(BillPayment.payment_date)
    ).all()
    return {
        "id": invoice.id,
        "supplier_id": invoice.supplier_id,
        "supplier": supplier.name if supplier else None,
        "purchase_order_id": invoice.purchase_order_id,
        "invoice_number": invoice.invoice_number,
        "invoice_date": invoice.invoice_date.isoformat() if invoice.invoice_date else None,
        "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
        "net_amount": str(invoice.net_amount or Decimal("0")),
        "vat_amount": str(invoice.vat_amount),
        "wht_amount": str(invoice.wht_amount),
        "total_amount": str(invoice.total_amount),
        "payment_status": invoice.payment_status,
        "matching_status": invoice.matching_status,
        "etims_invoice_number": invoice.etims_invoice_number,
        "etims_verification_reference": invoice.etims_verification_reference,
        "lines": [{
            "id": line.id,
            "purchase_order_line_id": line.purchase_order_line_id,
            "goods_receipt_line_id": line.goods_receipt_line_id,
            "item_id": line.item_id,
            "description": line.description,
            "quantity": str(line.quantity),
            "unit_price": str(line.unit_price),
            "amount": str(line.amount),
            "vat_amount": str(line.vat_amount),
            "variance_reason": line.variance_reason,
        } for line in lines],
        "payments": [{
            "id": payment.id,
            "payment_date": payment.payment_date.isoformat(),
            "amount": str(payment.amount),
            "payment_method_id": payment.payment_method_id,
        } for payment in payments],
    }


@router.get("/tax/settings")
def get_tax_settings(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> dict:
    setting = _tax_settings(db)
    db.commit()
    return {"vat_rate": str(setting.vat_rate), "wht_rates": setting.wht_rates}


@router.put("/tax/settings")
def update_tax_settings(
    payload: TaxSettingsInput,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("Admin")),
) -> dict:
    valid_categories = {"services", "professional_fees", "contractual"}
    if set(payload.wht_rates) - valid_categories:
        raise HTTPException(status_code=422, detail="WHT rates may only use supported supplier categories.")
    if any(rate < 0 or rate > 1 for rate in payload.wht_rates.values()):
        raise HTTPException(status_code=422, detail="Tax rates must be fractions between 0 and 1.")
    setting = _tax_settings(db)
    setting.vat_rate = payload.vat_rate
    setting.wht_rates = {key: str(value) for key, value in payload.wht_rates.items()}
    db.commit()
    return {"vat_rate": str(setting.vat_rate), "wht_rates": setting.wht_rates}


@router.post("/invoices", status_code=201)
def create_invoice(
    payload: SupplierInvoiceInput,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("Admin", "Procurement Officer", "Finance")),
) -> dict:
    supplier = db.get(Supplier, payload.supplier_id)
    if supplier is None or supplier.deleted_at is not None:
        raise HTTPException(status_code=422, detail="Supplier does not exist or is inactive.")
    if supplier.status == "Suspended":
        raise HTTPException(status_code=409, detail="Invoices for a suspended supplier cannot be entered.")
    order = None
    if payload.purchase_order_id is not None:
        order = db.get(PurchaseOrder, payload.purchase_order_id)
        if order is None or order.deleted_at is not None or order.supplier_id != supplier.id:
            raise HTTPException(status_code=422, detail="The purchase order must belong to this supplier.")
    settings = _tax_settings(db)
    net_total = Decimal("0")
    vat_total = Decimal("0")
    wht_rate = Decimal("0")
    if supplier.wht_applicable:
        configured_rate = settings.wht_rates.get(supplier.wht_category or "")
        if configured_rate is None:
            raise HTTPException(status_code=409, detail="Configure the supplier's withholding tax category rate first.")
        wht_rate = Decimal(str(configured_rate))
    invoice = SupplierInvoice(
        supplier_id=supplier.id,
        purchase_order_id=order.id if order else None,
        invoice_number=payload.invoice_number.strip(),
        invoice_date=payload.invoice_date,
        due_date=payload.due_date,
        total_amount=Decimal("0"),
        net_amount=Decimal("0"),
        vat_amount=Decimal("0"),
        wht_amount=Decimal("0"),
        payment_status="Unpaid",
        etims_invoice_number=payload.etims_invoice_number.strip() if payload.etims_invoice_number else None,
        etims_verification_reference=(
            payload.etims_verification_reference.strip()
            if payload.etims_verification_reference else None
        ),
    )
    duplicate = db.scalar(select(SupplierInvoice.id).where(
        SupplierInvoice.supplier_id == supplier.id,
        SupplierInvoice.invoice_number == invoice.invoice_number,
        SupplierInvoice.deleted_at.is_(None),
    ))
    if duplicate is not None:
        raise HTTPException(status_code=409, detail="This supplier invoice number is already recorded.")
    db.add(invoice)
    db.flush()
    all_matched = order is not None
    any_variance = False
    for line_input in payload.lines:
        po_line = None
        receipt_line = None
        item_id = line_input.item_id
        if order is not None:
            if line_input.purchase_order_line_id is None or line_input.goods_receipt_line_id is None:
                raise HTTPException(status_code=422, detail="PO invoices require a PO line and a goods-receipt line for every line.")
            po_line = db.get(PurchaseOrderLine, line_input.purchase_order_line_id)
            receipt_line = db.get(GoodsReceiptLine, line_input.goods_receipt_line_id)
            if po_line is None or po_line.purchase_order_id != order.id:
                raise HTTPException(status_code=422, detail="Invoice PO line does not belong to the selected order.")
            if receipt_line is None or receipt_line.purchase_order_line_id != po_line.id:
                raise HTTPException(status_code=422, detail="Invoice receipt line does not match the PO line.")
            if line_input.quantity > receipt_line.quantity:
                raise HTTPException(status_code=409, detail="Invoice quantity exceeds the matched receipt quantity.")
            item_id = po_line.item_id
        elif line_input.purchase_order_line_id or line_input.goods_receipt_line_id:
            raise HTTPException(status_code=422, detail="A direct invoice cannot reference a PO or receipt line.")
        if item_id is not None:
            item = db.get(Item, item_id)
            if item is None or item.deleted_at is not None:
                raise HTTPException(status_code=422, detail=f"Item {item_id} does not exist or is inactive.")
        line_net = _money(line_input.quantity * line_input.unit_price)
        treatment = item.vat_treatment if item_id is not None else "standard"
        line_vat = Decimal("0")
        if supplier.vat_registered and treatment == "standard":
            line_vat = _money(line_net * settings.vat_rate)
        price_variance = bool(po_line and line_input.unit_price != po_line.unit_price)
        if price_variance:
            any_variance = True
            if not line_input.variance_reason or not line_input.variance_reason.strip():
                raise HTTPException(status_code=409, detail="A price variance reason is required when invoice price differs from the PO.")
        db.add(SupplierInvoiceLine(
            invoice_id=invoice.id,
            purchase_order_line_id=po_line.id if po_line else None,
            goods_receipt_line_id=receipt_line.id if receipt_line else None,
            item_id=item_id,
            description=line_input.description.strip(),
            quantity=line_input.quantity,
            unit_price=line_input.unit_price,
            amount=line_net,
            vat_amount=line_vat,
            variance_reason=line_input.variance_reason.strip() if line_input.variance_reason else None,
        ))
        net_total += line_net
        vat_total += line_vat
        all_matched = all_matched and bool(po_line and receipt_line)
    invoice.net_amount = _money(net_total)
    invoice.vat_amount = _money(vat_total)
    invoice.wht_amount = _money(net_total * wht_rate)
    invoice.total_amount = _money(net_total + vat_total)
    invoice.matching_status = "Variance" if any_variance else ("Matched" if all_matched else "Unmatched")
    db.commit()
    db.refresh(invoice)
    return _invoice_data(db, invoice)


@router.get("/invoices")
def list_invoices(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> dict:
    invoices = db.scalars(
        select(SupplierInvoice).where(SupplierInvoice.deleted_at.is_(None))
        .order_by(SupplierInvoice.invoice_date.desc(), SupplierInvoice.id.desc())
    ).all()
    return {"items": [_invoice_data(db, invoice) for invoice in invoices]}


@router.post("/invoices/{invoice_id}/payments", status_code=201)
def record_payment(
    invoice_id: int,
    payload: BillPaymentInput,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("Admin", "Finance")),
) -> dict:
    invoice = db.get(SupplierInvoice, invoice_id)
    if invoice is None or invoice.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    supplier = db.get(Supplier, invoice.supplier_id)
    if supplier is None:
        raise HTTPException(status_code=409, detail="Invoice supplier is unavailable.")
    if supplier.vat_registered and (
        not invoice.etims_invoice_number or not invoice.etims_verification_reference
    ):
        raise HTTPException(status_code=409, detail="A VAT-registered supplier's eTIMS number and verification reference are required before payment.")
    if invoice.matching_status != "Matched":
        raise HTTPException(status_code=409, detail="Only three-way matched invoices can be paid.")
    paid = db.scalar(select(func.coalesce(func.sum(BillPayment.amount), 0)).where(
        BillPayment.invoice_id == invoice.id
    )) or Decimal("0")
    if paid + payload.amount > invoice.total_amount:
        raise HTTPException(status_code=409, detail="Payment exceeds the invoice's outstanding balance.")
    if payload.payment_method_id is not None and db.get(PaymentMethod, payload.payment_method_id) is None:
        raise HTTPException(status_code=422, detail="Payment method not found.")
    payment = BillPayment(
        invoice_id=invoice.id,
        payment_date=payload.payment_date,
        amount=payload.amount,
        payment_method_id=payload.payment_method_id,
    )
    db.add(payment)
    paid += payload.amount
    invoice.payment_status = "Paid" if paid == invoice.total_amount else "Partially paid"
    db.commit()
    db.refresh(payment)
    return {"id": payment.id, "invoice_id": invoice.id, "amount": str(payment.amount), "payment_status": invoice.payment_status}


@router.get("/reports/tax/vat-input.xlsx")
def vat_input_report(
    year: int = Query(ge=2000, le=9999),
    month: int = Query(ge=1, le=12),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("Admin", "Finance")),
) -> StreamingResponse:
    invoices = db.execute(
        select(
            SupplierInvoice.invoice_date,
            Supplier.name,
            Supplier.kra_pin,
            SupplierInvoice.net_amount,
            SupplierInvoice.vat_amount,
            SupplierInvoice.etims_invoice_number,
        )
        .join(Supplier, Supplier.id == SupplierInvoice.supplier_id)
        .where(
            SupplierInvoice.invoice_date >= date(year, month, 1),
            SupplierInvoice.invoice_date < date(year + (month == 12), month % 12 + 1, 1),
            SupplierInvoice.deleted_at.is_(None),
            SupplierInvoice.vat_amount > 0,
        )
        .order_by(SupplierInvoice.invoice_date, Supplier.name)
    ).all()
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "VAT Input"
    sheet.append(["Invoice date", "Supplier", "KRA PIN", "Net amount (KES)", "VAT (KES)", "eTIMS invoice number"])
    for row in invoices:
        sheet.append([
            row.invoice_date.isoformat() if row.invoice_date else "",
            row.name,
            row.kra_pin or "",
            float(row.net_amount or 0),
            float(row.vat_amount),
            row.etims_invoice_number or "",
        ])
    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="vat-input-{year}-{month:02d}.xlsx"'},
    )


@router.get("/reports/tax/withholding")
def withholding_tax_schedule(
    year: int = Query(ge=2000, le=9999),
    month: int = Query(ge=1, le=12),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("Admin", "Finance")),
) -> dict:
    rows = db.execute(
        select(
            Supplier.id,
            Supplier.name,
            Supplier.kra_pin,
            func.sum(SupplierInvoice.net_amount),
            func.sum(SupplierInvoice.wht_amount),
        )
        .join(SupplierInvoice, SupplierInvoice.supplier_id == Supplier.id)
        .where(
            SupplierInvoice.invoice_date >= date(year, month, 1),
            SupplierInvoice.invoice_date < date(year + (month == 12), month % 12 + 1, 1),
            SupplierInvoice.deleted_at.is_(None),
            SupplierInvoice.wht_amount > 0,
        )
        .group_by(Supplier.id, Supplier.name, Supplier.kra_pin)
        .order_by(Supplier.name)
    ).all()
    return {"year": year, "month": month, "items": [{
        "supplier_id": supplier_id,
        "supplier": name,
        "kra_pin": kra_pin,
        "taxable_net": str(net or Decimal("0")),
        "withholding_tax": str(wht or Decimal("0")),
    } for supplier_id, name, kra_pin, net, wht in rows]}
