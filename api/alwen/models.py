from datetime import date, datetime, timezone
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(table_name)s_%(column_0_name)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class SoftDeleteMixin:
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)


class SourceRowMixin:
    source_sheet: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    source_row: Mapped[int | None] = mapped_column(Integer, nullable=True)


class UserRole(StrEnum):
    ADMIN = "Admin"
    PROCUREMENT_OFFICER = "Procurement Officer"
    APPROVER = "Approver"
    DIRECTOR = "Director"
    STORE_KEEPER = "Store Keeper"
    PROJECT_MANAGER = "Project Manager"
    FINANCE = "Finance"


class RequestStatus(StrEnum):
    DRAFT = "Draft"
    SUBMITTED = "Submitted"
    APPROVED = "Approved"
    REJECTED = "Rejected"
    CONVERTED = "Converted to PO"


class DeliveryStatus(StrEnum):
    OPEN = "Open"
    PARTIALLY_RECEIVED = "Partially received"
    RECEIVED = "Received"
    CLOSED = "Closed"


class StockMovementType(StrEnum):
    RECEIPT = "Receipt"
    ISSUE = "Issue"
    RETURN = "Return"
    TRANSFER_IN = "Transfer in"
    TRANSFER_OUT = "Transfer out"
    ADJUSTMENT = "Adjustment"


class Supplier(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    normalized_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    contact_name: Mapped[str | None] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(40))
    address: Mapped[str | None] = mapped_column(Text)
    kra_pin: Mapped[str | None] = mapped_column(String(32))
    payment_terms: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="Active")
    vat_registered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    wht_applicable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    wht_category: Mapped[str | None] = mapped_column(String(40))
    performance_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    performance_score_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    qbo_vendor_id: Mapped[str | None] = mapped_column(String(64), index=True)
    qbo_sync_token: Mapped[str | None] = mapped_column(String(64))


class Category(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)


class Unit(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "units"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(64), nullable=False)


class PaymentMethod(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "payment_methods"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)


class Project(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    parent_project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"))
    budget: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    qbo_class_id: Mapped[str | None] = mapped_column(String(64), index=True)
    qbo_sync_token: Mapped[str | None] = mapped_column(String(64))


class Store(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "stores"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    location: Mapped[str | None] = mapped_column(String(200))


class Staff(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "staff"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(320), index=True)
    phone: Mapped[str | None] = mapped_column(String(40))
    technician_number: Mapped[str | None] = mapped_column(String(64))


class User(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(40))
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False, default=UserRole.PROCUREMENT_OFFICER.value)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_notifications: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ApiSession(Base):
    __tablename__ = "api_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class Item(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str | None] = mapped_column(String(80), unique=True)
    name: Mapped[str] = mapped_column(String(240), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    unit_id: Mapped[int | None] = mapped_column(ForeignKey("units.id"))
    reorder_level: Mapped[Decimal] = mapped_column(Numeric(14, 3), default=Decimal("0"), nullable=False)
    preferred_supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"))
    vat_treatment: Mapped[str] = mapped_column(String(24), nullable=False, default="standard")
    qbo_item_id: Mapped[str | None] = mapped_column(String(64), index=True)
    qbo_sync_token: Mapped[str | None] = mapped_column(String(64))
    qbo_asset_account_id: Mapped[str | None] = mapped_column(String(64))
    qbo_income_account_id: Mapped[str | None] = mapped_column(String(64))
    qbo_expense_account_id: Mapped[str | None] = mapped_column(String(64))


class PurchaseRequest(Base, TimestampMixin, SoftDeleteMixin, SourceRowMixin):
    __tablename__ = "purchase_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_number: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    week_number: Mapped[int | None] = mapped_column(Integer)
    request_date: Mapped[date | None] = mapped_column(Date)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    prepared_by_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id"))
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"))
    required_by: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(32), default=RequestStatus.DRAFT.value, nullable=False)
    budget_override_reason: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="app")


class PurchaseRequestLine(Base, TimestampMixin, SourceRowMixin):
    __tablename__ = "purchase_request_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("purchase_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id"))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    unit_id: Mapped[int | None] = mapped_column(ForeignKey("units.id"))
    proposed_supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"))
    proposed_supplier_reason: Mapped[str | None] = mapped_column(Text)
    contract_line_id: Mapped[int | None] = mapped_column(ForeignKey("contract_lines.id"))


class SupplierQuote(Base, TimestampMixin, SourceRowMixin):
    __tablename__ = "supplier_quotes"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("purchase_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), nullable=False, index=True)
    quote_reference: Mapped[str | None] = mapped_column(String(120))
    quote_date: Mapped[date | None] = mapped_column(Date)


class QuotationLine(Base, TimestampMixin, SourceRowMixin):
    __tablename__ = "quotation_lines"
    __table_args__ = (UniqueConstraint("quote_id", "request_line_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    quote_id: Mapped[int] = mapped_column(ForeignKey("supplier_quotes.id", ondelete="CASCADE"), nullable=False, index=True)
    request_line_id: Mapped[int] = mapped_column(ForeignKey("purchase_request_lines.id", ondelete="CASCADE"), nullable=False, index=True)
    rate: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)


class Approval(Base, TimestampMixin):
    __tablename__ = "approvals"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("purchase_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    decision: Mapped[str] = mapped_column(String(32), nullable=False)
    comments: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class PurchaseOrder(Base, TimestampMixin, SoftDeleteMixin, SourceRowMixin):
    __tablename__ = "purchase_orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_number: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"), index=True)
    request_id: Mapped[int | None] = mapped_column(ForeignKey("purchase_requests.id"))
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), index=True)
    order_date: Mapped[date | None] = mapped_column(Date)
    expected_delivery_date: Mapped[date | None] = mapped_column(Date)
    delivery_status: Mapped[str] = mapped_column(String(32), default=DeliveryStatus.OPEN.value, nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="app")
    qbo_purchase_order_id: Mapped[str | None] = mapped_column(String(64), index=True)
    qbo_sync_token: Mapped[str | None] = mapped_column(String(64))


class PurchaseOrderLine(Base, TimestampMixin, SourceRowMixin):
    __tablename__ = "purchase_order_lines"
    __table_args__ = (UniqueConstraint("request_line_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_order_id: Mapped[int] = mapped_column(ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    request_line_id: Mapped[int | None] = mapped_column(ForeignKey("purchase_request_lines.id"), index=True)
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id"))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    contract_line_id: Mapped[int | None] = mapped_column(ForeignKey("contract_lines.id"), index=True)


class GoodsReceipt(Base, TimestampMixin, SourceRowMixin):
    __tablename__ = "goods_receipts"

    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_order_id: Mapped[int | None] = mapped_column(ForeignKey("purchase_orders.id"), index=True)
    received_date: Mapped[date] = mapped_column(Date, nullable=False)
    receiver_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id"))
    delivery_note_number: Mapped[str | None] = mapped_column(String(120))
    store_id: Mapped[int | None] = mapped_column(ForeignKey("stores.id"))
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"))
    purpose: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="app")


class GoodsReceiptLine(Base, TimestampMixin, SourceRowMixin):
    __tablename__ = "goods_receipt_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    receipt_id: Mapped[int] = mapped_column(ForeignKey("goods_receipts.id", ondelete="CASCADE"), nullable=False, index=True)
    purchase_order_line_id: Mapped[int | None] = mapped_column(ForeignKey("purchase_order_lines.id"), index=True)
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id"))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)


class StockMovement(Base, TimestampMixin, SourceRowMixin):
    __tablename__ = "stock_movements"
    __table_args__ = (Index("ix_stock_movements_item_store_movement_date", "item_id", "store_id", "movement_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), nullable=False, index=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), nullable=False, index=True)
    movement_type: Mapped[str] = mapped_column(String(32), nullable=False)
    movement_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    unit_cost: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"))
    staff_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id"))
    purpose: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    related_movement_id: Mapped[int | None] = mapped_column(ForeignKey("stock_movements.id"))
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="app")


class StockBalance(Base, TimestampMixin):
    __tablename__ = "stock_balances"
    __table_args__ = (UniqueConstraint("item_id", "store_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), nullable=False, index=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), nullable=False, index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False, default=Decimal("0"))
    average_unit_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))


class SupplierInvoice(Base, TimestampMixin, SoftDeleteMixin, SourceRowMixin):
    __tablename__ = "supplier_invoices"

    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), nullable=False, index=True)
    purchase_order_id: Mapped[int | None] = mapped_column(ForeignKey("purchase_orders.id"), index=True)
    invoice_number: Mapped[str] = mapped_column(String(120), nullable=False)
    invoice_date: Mapped[date | None] = mapped_column(Date)
    due_date: Mapped[date | None] = mapped_column(Date)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    net_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    wht_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    etims_invoice_number: Mapped[str | None] = mapped_column(String(120))
    etims_verification_reference: Mapped[str | None] = mapped_column(String(240))
    payment_status: Mapped[str] = mapped_column(String(32), nullable=False, default="Unpaid")
    matching_status: Mapped[str] = mapped_column(String(24), nullable=False, default="Unmatched")
    attachment_path: Mapped[str | None] = mapped_column(String(500))
    qbo_bill_id: Mapped[str | None] = mapped_column(String(64), index=True)
    qbo_sync_token: Mapped[str | None] = mapped_column(String(64))


class SupplierInvoiceLine(Base, TimestampMixin, SourceRowMixin):
    __tablename__ = "supplier_invoice_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("supplier_invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    purchase_order_line_id: Mapped[int | None] = mapped_column(ForeignKey("purchase_order_lines.id"))
    goods_receipt_line_id: Mapped[int | None] = mapped_column(ForeignKey("goods_receipt_lines.id"))
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id"))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    variance_reason: Mapped[str | None] = mapped_column(Text)


class BillPayment(Base, TimestampMixin, SourceRowMixin):
    __tablename__ = "bill_payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("supplier_invoices.id"), nullable=False, index=True)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    payment_method_id: Mapped[int | None] = mapped_column(ForeignKey("payment_methods.id"))
    qbo_bill_payment_id: Mapped[str | None] = mapped_column(String(64), index=True)
    qbo_sync_token: Mapped[str | None] = mapped_column(String(64))


class ProjectMonthlyBudget(Base, TimestampMixin):
    __tablename__ = "project_monthly_budgets"
    __table_args__ = (
        UniqueConstraint("project_id", "year", "month"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)


class ApprovalDelegation(Base, TimestampMixin):
    __tablename__ = "approval_delegations"

    id: Mapped[int] = mapped_column(primary_key=True)
    delegator_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    delegate_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class ApprovalStep(Base, TimestampMixin):
    __tablename__ = "approval_steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("purchase_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    required_role: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="Pending")
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    decision: Mapped[str | None] = mapped_column(String(32))
    comments: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SystemAlert(Base, TimestampMixin):
    __tablename__ = "system_alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    alert_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(80), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SupplierDocument(Base, TimestampMixin):
    __tablename__ = "supplier_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True)
    document_type: Mapped[str] = mapped_column(String(80), nullable=False)
    reference: Mapped[str] = mapped_column(String(500), nullable=False)
    expires_on: Mapped[date | None] = mapped_column(Date)


class GoodsRejection(Base, TimestampMixin):
    __tablename__ = "goods_rejections"

    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_order_id: Mapped[int] = mapped_column(ForeignKey("purchase_orders.id"), nullable=False, index=True)
    purchase_order_line_id: Mapped[int] = mapped_column(ForeignKey("purchase_order_lines.id"), nullable=False, index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    rejected_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)


class Contract(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "contracts"

    id: Mapped[int] = mapped_column(primary_key=True)
    contract_number: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), nullable=False, index=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    payment_terms: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="draft")
    document_path: Mapped[str | None] = mapped_column(String(500))


class ContractLine(Base, TimestampMixin):
    __tablename__ = "contract_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id"))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    agreed_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    max_quantity: Mapped[Decimal | None] = mapped_column(Numeric(14, 3))
    called_off_quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False, default=Decimal("0"))


class NotificationPreference(Base, TimestampMixin):
    __tablename__ = "notification_preferences"
    __table_args__ = (UniqueConstraint("user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    email_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sms_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    alert_kinds: Mapped[list] = mapped_column(JSON, nullable=False, default=list)


class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)


class TaxSetting(Base, TimestampMixin):
    __tablename__ = "tax_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False, default=Decimal("0.16"))
    wht_rates: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class QboEntityMapping(Base, TimestampMixin):
    __tablename__ = "qbo_entity_mappings"
    __table_args__ = (UniqueConstraint("entity_type", "local_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    local_id: Mapped[str] = mapped_column(String(80), nullable=False)
    qbo_id: Mapped[str] = mapped_column(String(80), nullable=False)
    sync_token: Mapped[str | None] = mapped_column(String(80))


class PPEIssue(Base, TimestampMixin, SourceRowMixin):
    __tablename__ = "ppe_issues"

    id: Mapped[int] = mapped_column(primary_key=True)
    staff_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id"), index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), index=True)
    requested_date: Mapped[date | None] = mapped_column(Date)
    issued_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="Requested")


class PPEIssueLine(Base, TimestampMixin, SourceRowMixin):
    __tablename__ = "ppe_issue_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    ppe_issue_id: Mapped[int] = mapped_column(ForeignKey("ppe_issues.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id"))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    size: Mapped[str | None] = mapped_column(String(40))
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)


class ImportBatch(Base, TimestampMixin):
    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="Staged")
    dry_run: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    report: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class ImportRow(Base, TimestampMixin):
    __tablename__ = "import_rows"

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    source_sheet: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    source_row: Mapped[int] = mapped_column(Integer, nullable=False)
    source_column: Mapped[int | None] = mapped_column(Integer)
    record_type: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    raw_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    normalized_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    warnings: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    errors: Mapped[list] = mapped_column(JSON, nullable=False, default=list)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    before_data: Mapped[dict | None] = mapped_column(JSON)
    after_data: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)


class QboSyncLog(Base):
    __tablename__ = "qbo_sync_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    qbo_id: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(Text)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class QboConnection(Base, TimestampMixin):
    __tablename__ = "qbo_connections"

    id: Mapped[int] = mapped_column(primary_key=True)
    realm_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    environment: Mapped[str] = mapped_column(String(16), nullable=False, default="sandbox")
    access_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    access_token_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    connected_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class QboOAuthState(Base):
    __tablename__ = "qbo_oauth_states"

    id: Mapped[int] = mapped_column(primary_key=True)
    state_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


class QboAccountMapping(Base, TimestampMixin):
    __tablename__ = "qbo_account_mappings"
    __table_args__ = (UniqueConstraint("account_type", "qbo_account_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    account_type: Mapped[str] = mapped_column(String(32), nullable=False)
    qbo_account_id: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    account_number: Mapped[str | None] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
