from sqlalchemy import create_engine, inspect, select
from sqlalchemy.orm import Session

from alwen.models import Base, Category, PurchaseOrderLine
from alwen.seed import DEFAULT_CATEGORIES, seed_reference_data


def test_schema_creates_core_tables_and_decimal_money_columns():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    tables = set(inspect(engine).get_table_names())
    assert {
        "items",
        "purchase_requests",
        "supplier_quotes",
        "purchase_orders",
        "stock_movements",
        "supplier_invoices",
        "supplier_invoice_lines",
        "import_rows",
        "audit_logs",
    }.issubset(tables)
    subtotal = next(column for column in PurchaseOrderLine.__table__.columns if column.name == "subtotal")
    assert subtotal.type.precision == 14
    assert subtotal.type.scale == 2


def test_reference_seed_is_idempotent():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        seed_reference_data(session)
        seed_reference_data(session)
        assert len(session.scalars(select(Category)).all()) == len(DEFAULT_CATEGORIES)
