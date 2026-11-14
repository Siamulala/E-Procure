from datetime import date
from decimal import Decimal

from openpyxl import Workbook
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from alwen.importer import (
    ImportedRow,
    ImportReport,
    _date_warnings,
    commit_import,
    import_workbook,
    normalize_category,
    normalize_phone,
    normalize_unit,
    stage_import,
)
from alwen.models import (
    Approval,
    Base,
    GoodsReceipt,
    ImportBatch,
    ImportRow,
    PurchaseOrder,
    PurchaseRequest,
    StockMovement,
)


def test_normalizes_units_categories_phones_and_dates():
    assert normalize_unit("Pcs") == "pcs"
    assert normalize_unit("reels") == "reel"
    assert normalize_unit("rolls") == "roll"
    assert normalize_category("ADSS Cable 24 core") == "ADSS Cables (24 core)"
    assert normalize_phone("7.16155427E8") == "0716155427"
    assert _date_warnings("02/03/2026") == ("2026-03-02", [])
    assert _date_warnings(date(2024, 3, 2))[1]


def test_weekly_request_quotes_keep_source_and_flag_variances(tmp_path):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Week 2"
    sheet.append(["Prepared by", "Site team", "Date", date(2026, 3, 2)])
    sheet.append([
        "Item", "Description", "Qty", "Unit", "Proposed Supplier", "Remarks",
        "Nile", "Nile", "Supreme Trank", "Supreme Trank",
    ])
    sheet.append([None, None, None, None, None, None, "Rate", "Amount", "Rate", "Amount"])
    sheet.append([
        "ADSS Cable", "24 core cable", 10, "pcs", "Supreme Trank", None,
        Decimal("100"), Decimal("999"), Decimal("120"), Decimal("1200"),
    ])
    sheet.append(["", "", "", "", "", "", "", "", "", ""])
    workbook.create_sheet("Summary for 2026")
    workbook.create_sheet("Pivot Table")
    categories = workbook.create_sheet("CATEGORIES")
    categories.append(["Vendors", "Units", "Payment Methods", "Receivers", "Items"])
    categories.append(["Nile", "rolls", "Bank Transfer", "Amina", "ADSS Cable"])
    path = tmp_path / "alwen.xlsx"
    workbook.save(path)

    report = import_workbook(path)

    imported = next(row for row in report.rows if row.record_type == "purchase_request")
    assert imported.record_type == "purchase_request"
    assert imported.source_sheet == "Week 2"
    assert imported.source_row == 4
    assert imported.normalized_data["week_number"] == 2
    assert imported.normalized_data["date"] == "2026-03-02"
    assert imported.normalized_data["proposed_supplier"] == "Supreme Trak Safety"
    assert imported.normalized_data["quotes"][0]["supplier"] == "Nile Computers"
    assert imported.normalized_data["category"] == "ADSS Cables (24 core)"
    assert any("does not match quantity" in warning for warning in imported.warnings)
    assert any("not the lowest quote" in warning for warning in imported.warnings)
    assert {"Summary for 2026", "Pivot Table"} == set(report.reference_sheets)
    assert report.summary_validation["missing_reference_sheets"] == []
    lookup_seeds = [row for row in report.rows if row.record_type == "lookup_seed"]
    assert any(row.normalized_data == {
        "list_name": "Units",
        "lookup_type": "unit",
        "value": "roll",
    } for row in lookup_seeds)
    assert any(
        suggestion["match_type"] == "known_alias"
        and "Supreme Trank" in suggestion["names"]
        for suggestion in report.supplier_merge_suggestions
    )


def test_apply_stages_rows_with_source_coordinates(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'staging.db'}")
    Base.metadata.create_all(engine)
    test_sessions = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr("alwen.importer.SessionLocal", test_sessions)
    report = ImportReport(
        filename="legacy.xlsx",
        rows=[
            ImportedRow(
                record_type="stock_in",
                source_sheet="EXPENDITURE",
                source_row=19,
                raw_data={"3": "ADSS Cable"},
                normalized_data={"item": "ADSS Cable", "quantity": "5"},
                source_column=3,
            )
        ],
    )

    batch_id = stage_import(report)

    with test_sessions() as session:
        batch = session.get(ImportBatch, batch_id)
        row = session.scalar(select(ImportRow).where(ImportRow.batch_id == batch_id))
        assert batch is not None
        assert batch.dry_run is False
        assert row is not None
        assert (row.source_sheet, row.source_row, row.source_column, row.record_type) == (
            "EXPENDITURE", 19, 3, "stock_in"
        )


def test_commit_import_creates_historical_records_without_approval_or_stock_checks(tmp_path, monkeypatch):
    workbook = Workbook()
    request_sheet = workbook.active
    request_sheet.title = "Week 1"
    request_sheet.append(["Project", "Kericho"])
    request_sheet.append(["Item", "Description", "Qty", "Unit", "Proposed Supplier", "Nile Rate", "Nile Amount"])
    request_sheet.append(["Cable", "Drop cable", 2, "pcs", "Nile Computers", 10, 20])
    po_sheet = workbook.create_sheet("Order List Week 1")
    po_sheet.append(["Item", "Description", "Qty", "Unit", "Unit Price", "Amount", "Supplier", "Date"])
    po_sheet.append(["Cable", "Drop cable", 2, "pcs", 10, 20, "Nile Computers", date(2026, 3, 2)])
    stock_sheet = workbook.create_sheet("EXPENDITURE")
    stock_sheet.append(["Item", "Description", "Qty", "Unit", "Unit Price", "Amount", "Date"])
    stock_sheet.append(["Cable", "Drop cable", 3, "pcs", 10, 30, date(2026, 3, 2)])
    summary_sheet = workbook.create_sheet("Summary for 2026")
    summary_sheet.append(["Supplier", "Month", "Amount"])
    summary_sheet.append(["Nile Computers", "Mar 2026", 20])
    pivot_sheet = workbook.create_sheet("Pivot Table")
    pivot_sheet.append(["Category", "Total"])
    pivot_sheet.append(["2km Drop Cable", 50])
    path = tmp_path / "source.xlsx"
    workbook.save(path)

    engine = create_engine(f"sqlite:///{tmp_path / 'commit.db'}")
    Base.metadata.create_all(engine)
    test_sessions = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr("alwen.importer.SessionLocal", test_sessions)

    report = import_workbook(path)
    assert report.summary_validation["status"] == "compared"
    assert report.summary_validation["differences"] == {
        "monthly_supplier": [],
        "category": [],
    }
    result = commit_import(report)

    with test_sessions() as session:
        assert result["counts"]["purchase_requests"] == 1
        assert result["counts"]["purchase_orders"] == 1
        assert result["counts"]["stock_receipts"] == 1
        request = session.scalar(select(PurchaseRequest))
        order = session.scalar(select(PurchaseOrder))
        receipt = session.scalar(select(GoodsReceipt))
        assert request is not None and request.source == "import" and request.status == "Approved"
        assert order is not None and order.source == "import"
        assert receipt is not None and receipt.source == "import"
        assert session.scalar(select(Approval.id)) is None
        movement = session.scalar(select(StockMovement))
        assert movement is not None and movement.source == "import"
        assert movement.source_sheet == "EXPENDITURE" and movement.source_row == 2
