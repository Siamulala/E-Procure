from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from alwen.time_utils import business_today


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class QuoteLineInput(APIModel):
    line_index: int = Field(ge=0)
    rate: Decimal = Field(gt=0, max_digits=14, decimal_places=2)


class QuoteInput(APIModel):
    supplier_id: int = Field(gt=0)
    reference: str | None = Field(default=None, max_length=120)
    quote_date: date | None = None
    lines: list[QuoteLineInput] = Field(min_length=1)


class PurchaseRequestLineInput(APIModel):
    item_id: int | None = Field(default=None, gt=0)
    description: str = Field(min_length=1, max_length=4000)
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    unit_id: int | None = Field(default=None, gt=0)
    proposed_supplier_id: int | None = Field(default=None, gt=0)
    proposed_supplier_reason: str | None = Field(default=None, max_length=4000)
    contract_line_id: int | None = Field(default=None, gt=0)


class PurchaseRequestInput(APIModel):
    request_date: date = Field(default_factory=business_today)
    required_by: date | None = None
    project_id: int | None = Field(default=None, gt=0)
    budget_override_reason: str | None = Field(default=None, max_length=4000)
    lines: list[PurchaseRequestLineInput] = Field(min_length=1)
    quotes: list[QuoteInput] = Field(default_factory=list)


class DecisionInput(APIModel):
    decision: Literal["Approved", "Rejected"]
    comments: str | None = Field(default=None, max_length=4000)


class ReceiptLineInput(APIModel):
    purchase_order_line_id: int | None = Field(default=None, gt=0)
    item_id: int | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, max_length=4000)
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    unit_cost: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)


class GoodsReceiptInput(APIModel):
    purchase_order_id: int | None = Field(default=None, gt=0)
    received_date: date = Field(default_factory=business_today)
    receiver_id: int = Field(gt=0)
    delivery_note_number: str | None = Field(default=None, max_length=120)
    store_id: int = Field(gt=0)
    project_id: int | None = Field(default=None, gt=0)
    purpose: str | None = Field(default=None, max_length=4000)
    lines: list[ReceiptLineInput] = Field(min_length=1)


class StockIssueInput(APIModel):
    item_id: int = Field(gt=0)
    store_id: int = Field(gt=0)
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    movement_date: date = Field(default_factory=business_today)
    project_id: int | None = Field(default=None, gt=0)
    staff_id: int = Field(gt=0)
    purpose: str = Field(min_length=1, max_length=4000)


class StockReturnInput(APIModel):
    original_issue_id: int = Field(gt=0)
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    movement_date: date = Field(default_factory=business_today)
    reason: str = Field(min_length=1, max_length=4000)


class StockTransferInput(APIModel):
    item_id: int = Field(gt=0)
    from_store_id: int = Field(gt=0)
    to_store_id: int = Field(gt=0)
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    movement_date: date = Field(default_factory=business_today)
    reason: str = Field(min_length=1, max_length=4000)


class StockAdjustmentInput(APIModel):
    item_id: int = Field(gt=0)
    store_id: int = Field(gt=0)
    quantity_delta: Decimal = Field(max_digits=14, decimal_places=3)
    movement_date: date = Field(default_factory=business_today)
    reason: str = Field(min_length=1, max_length=4000)


class SupplierCreate(APIModel):
    name: str = Field(min_length=1, max_length=200)
    contact_name: str | None = Field(default=None, max_length=200)
    email: str | None = Field(default=None, max_length=320)
    phone: str | None = Field(default=None, max_length=40)
    kra_pin: str | None = Field(default=None, max_length=32)
    payment_terms: str | None = Field(default=None, max_length=100)
    vat_registered: bool = False
    wht_applicable: bool = False
    wht_category: Literal["services", "professional_fees", "contractual"] | None = None


class ItemCreate(APIModel):
    sku: str | None = Field(default=None, max_length=80)
    name: str = Field(min_length=1, max_length=240)
    description: str | None = Field(default=None, max_length=4000)
    category_id: int | None = Field(default=None, gt=0)
    unit_id: int | None = Field(default=None, gt=0)
    reorder_level: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=3)
    preferred_supplier_id: int | None = Field(default=None, gt=0)
    vat_treatment: Literal["standard", "exempt", "zero_rated"] = "standard"


class StoreCreate(APIModel):
    name: str = Field(min_length=1, max_length=120)
    location: str | None = Field(default=None, max_length=200)


class StaffCreate(APIModel):
    name: str = Field(min_length=1, max_length=200)
    email: str | None = Field(default=None, max_length=320)
    phone: str | None = Field(default=None, max_length=40)
    technician_number: str | None = Field(default=None, max_length=64)


class ProjectMonthlyBudgetInput(APIModel):
    amount: Decimal = Field(ge=0, max_digits=14, decimal_places=2)


class ApprovalDelegationInput(APIModel):
    delegate_user_id: int = Field(gt=0)
    starts_at: datetime
    ends_at: datetime


class GoodsRejectionInput(APIModel):
    po_line_id: int = Field(gt=0)
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    reason: str = Field(min_length=1, max_length=4000)


class NotificationPreferenceInput(APIModel):
    email_enabled: bool = True
    sms_enabled: bool = False
    alert_kinds: list[str] = Field(default_factory=list, max_length=30)


class InvoiceLineInput(APIModel):
    description: str = Field(min_length=1, max_length=4000)
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    unit_price: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    item_id: int | None = Field(default=None, gt=0)
    purchase_order_line_id: int | None = Field(default=None, gt=0)
    goods_receipt_line_id: int | None = Field(default=None, gt=0)
    variance_reason: str | None = Field(default=None, max_length=4000)


class SupplierInvoiceInput(APIModel):
    supplier_id: int = Field(gt=0)
    purchase_order_id: int | None = Field(default=None, gt=0)
    invoice_number: str = Field(min_length=1, max_length=120)
    invoice_date: date
    due_date: date | None = None
    etims_invoice_number: str | None = Field(default=None, max_length=120)
    etims_verification_reference: str | None = Field(default=None, max_length=240)
    lines: list[InvoiceLineInput] = Field(min_length=1)


class BillPaymentInput(APIModel):
    payment_date: date = Field(default_factory=business_today)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    payment_method_id: int | None = Field(default=None, gt=0)


class TaxSettingsInput(APIModel):
    vat_rate: Decimal = Field(ge=0, le=1, max_digits=6, decimal_places=4)
    wht_rates: dict[str, Decimal] = Field(default_factory=dict)
