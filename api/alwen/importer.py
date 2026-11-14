import argparse
import json
import re
import uuid
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from openpyxl import load_workbook
from openpyxl.utils.datetime import from_excel
from sqlalchemy import func, select

from alwen.database import SessionLocal
from alwen.models import (
    Category,
    GoodsReceipt,
    GoodsReceiptLine,
    ImportBatch,
    ImportRow,
    Item,
    PaymentMethod,
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
    Unit,
)
from alwen.stock import _balance, _increase_balance, _movement_time
from alwen.time_utils import business_today

EXPECTED_YEARS = {2025, 2026}
MONEY_QUANTUM = Decimal("0.01")
AMOUNT_TOLERANCE = Decimal("0.00")

UNIT_ALIASES = {
    "pc": "pcs",
    "pcs": "pcs",
    "piece": "pcs",
    "pieces": "pcs",
    "roll": "roll",
    "rolls": "roll",
    "reel": "reel",
    "reels": "reel",
    "pair": "pair",
    "pairs": "pair",
    "pkt": "pkt",
    "pkts": "pkt",
    "packet": "pkt",
    "packets": "pkt",
    "m": "m",
    "meter": "m",
    "meters": "m",
    "metre": "m",
    "metres": "m",
}

SUPPLIER_ALIASES = {
    "nile": "Nile Computers",
    "nile computers": "Nile Computers",
    "supreme trank": "Supreme Trak Safety",
    "supreme trank safety": "Supreme Trak Safety",
    "supreme trak": "Supreme Trak Safety",
    "supreme trak safety": "Supreme Trak Safety",
    "liam ltd": "Liam Enterprise",
    "liam enterprise": "Liam Enterprise",
    "ctc": "CTC",
    "eca": "ECA",
    "digital accessories": "Digital Accessories",
    "g tech solutions": "G-tech Solutions",
    "safety max": "Safety Max",
    "safety hub": "Safety Hub",
}

CATEGORY_ALIASES = {
    "2km drop cable": "2km Drop Cable",
    "drop cable": "2km Drop Cable",
    "indoor cable": "Indoor/Gigalan Cable",
    "gigalan cable": "Indoor/Gigalan Cable",
    "adss cable": "ADSS Cables",
    "accessories": "Accessories",
    "equipment": "Equipment",
    "tools": "Tools",
    "ppe": "PPEs",
    "ppes": "PPEs",
    "fleet tools": "Fleet Tools",
    "safety": "Safety",
}

FIELD_ALIASES = {
    "item": "item",
    "item name": "item",
    "material": "item",
    "description": "description",
    "item description": "description",
    "qty": "quantity",
    "quantity": "quantity",
    "units": "unit",
    "unit": "unit",
    "uom": "unit",
    "category": "category",
    "date": "date",
    "request date": "date",
    "supplier": "supplier",
    "vendor": "supplier",
    "proposed supplier": "proposed_supplier",
    "recommended supplier": "proposed_supplier",
    "remarks": "remarks",
    "remark": "remarks",
    "notes": "purpose",
    "purpose": "purpose",
    "purpose notes": "purpose",
    "payment method": "payment_method",
    "receiver": "receiver",
    "received by": "receiver",
    "prepared by": "prepared_by",
    "unit price": "unit_price",
    "price": "unit_price",
    "rate": "rate",
    "subtotal": "amount",
    "amount": "amount",
    "total": "amount",
    "phone": "phone",
    "telephone": "phone",
    "contact": "contact",
    "technician": "technician",
    "staff": "technician",
    "size": "size",
}

GENERIC_HEADER_WORDS = {
    "item", "description", "qty", "quantity", "unit", "units", "uom", "date",
    "rate", "amount", "unit price", "price", "subtotal", "total", "supplier",
    "vendor", "remarks", "proposed supplier", "payment method", "receiver",
    "purpose", "notes", "prepared by", "phone", "contact", "technician", "size",
}
NON_LOWEST_REASON_TERMS = {
    "out of stock", "quality", "specification", "compatibility", "urgent",
    "available", "delivery", "brand", "warranty",
}
MONTH_NAMES = {
    name.lower(): month
    for month, names in enumerate((
        ("jan", "january"), ("feb", "february"), ("mar", "march"),
        ("apr", "april"), ("may",), ("jun", "june"),
        ("jul", "july"), ("aug", "august"), ("sep", "september"),
        ("oct", "october"), ("nov", "november"), ("dec", "december"),
    ), start=1)
    for name in names
}


@dataclass
class ImportedRow:
    record_type: str
    source_sheet: str
    source_row: int
    raw_data: dict[str, Any]
    normalized_data: dict[str, Any]
    source_column: int | None = None
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def status(self) -> str:
        if self.errors:
            return "Error"
        return "Warning" if self.warnings else "Ready"


@dataclass
class ImportReport:
    filename: str
    rows: list[ImportedRow] = field(default_factory=list)
    ignored_sheets: list[str] = field(default_factory=list)
    sheet_issues: list[dict[str, str]] = field(default_factory=list)
    supplier_merge_suggestions: list[dict[str, Any]] = field(default_factory=list)
    reference_sheets: dict[str, list[list[Any]]] = field(default_factory=dict)
    summary_validation: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "filename": self.filename,
            "counts": {
                "rows": len(self.rows),
                "ready": sum(row.status == "Ready" for row in self.rows),
                "warnings": sum(row.status == "Warning" for row in self.rows),
                "errors": sum(row.status == "Error" for row in self.rows),
            },
            "ignored_sheets": self.ignored_sheets,
            "sheet_issues": self.sheet_issues,
            "supplier_merge_suggestions": self.supplier_merge_suggestions,
            "reference_sheets": self.reference_sheets,
            "summary_validation": self.summary_validation,
            "rows": [asdict(row) | {"status": row.status} for row in self.rows],
        }


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _header_key(value: Any) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", _text(value).lower())).strip()


def _field_key(value: Any) -> str:
    return FIELD_ALIASES.get(_header_key(value), "")


def _decimal(value: Any) -> Decimal | None:
    if value is None or _text(value) == "":
        return None
    try:
        cleaned = _text(value).replace(",", "").replace("KES", "").replace("KSh", "").strip()
        if cleaned.startswith("(") and cleaned.endswith(")"):
            cleaned = f"-{cleaned[1:-1]}"
        result = Decimal(cleaned)
        return result if result.is_finite() else None
    except (InvalidOperation, ValueError):
        return None


def _money(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return str(value.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP))


def _date_value(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)):
        try:
            converted = from_excel(value)
            if isinstance(converted, datetime):
                return converted.date()
            return converted if isinstance(converted, date) else None
        except (OverflowError, TypeError, ValueError):
            return None
    raw = _text(value)
    if not raw:
        return None
    for pattern in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y"):
        try:
            return datetime.strptime(raw, pattern).date()
        except ValueError:
            continue
    return None


def _json_value(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, float):
        return str(Decimal(str(value)))
    return value


def normalize_unit(value: Any) -> str | None:
    key = _header_key(value)
    return UNIT_ALIASES.get(key, key or None)


def normalize_phone(value: Any) -> str | None:
    raw = _text(value)
    if not raw:
        return None
    try:
        numeric = Decimal(raw.replace(",", ""))
        if numeric.is_finite():
            digits = str(int(numeric))
        else:
            digits = ""
    except (InvalidOperation, ValueError):
        digits = re.sub(r"\D", "", raw)
        if raw.startswith("+") and digits.startswith("254"):
            digits = digits[3:]

    if len(digits) == 9 and digits.startswith(("7", "1")):
        return f"0{digits}"
    if len(digits) == 12 and digits.startswith("254"):
        return f"0{digits[3:]}"
    return digits or None


def normalize_category(value: Any) -> str | None:
    key = _header_key(value)
    if not key:
        return None
    for alias, category in CATEGORY_ALIASES.items():
        if alias in key:
            if category == "ADSS Cables":
                core_match = re.search(r"\b(8|12|24|48)\s*core", key)
                return f"ADSS Cables ({core_match.group(1)} core)" if core_match else category
            return category
    return None


def canonical_supplier(value: Any) -> tuple[str | None, str | None]:
    name = _text(value)
    if not name:
        return None, None
    key = _header_key(name)
    if key in SUPPLIER_ALIASES:
        canonical = SUPPLIER_ALIASES[key]
        return canonical, canonical if canonical != name else None
    return name, None


def _find_header_row(sheet: Any) -> int | None:
    for row_number in range(1, min(sheet.max_row, 30) + 1):
        fields = {_field_key(cell.value) for cell in sheet[row_number]}
        if row_number > 1 and {"rate", "amount"} & fields:
            previous_fields = {_field_key(cell.value) for cell in sheet[row_number - 1]}
            if {"item", "quantity", "unit"}.issubset(previous_fields):
                return row_number
    for row_number in range(1, min(sheet.max_row, 30) + 1):
        fields = {_field_key(cell.value) for cell in sheet[row_number]}
        if {"item", "quantity"}.issubset(fields) and ({"description", "unit"} & fields):
            return row_number
    return None


def _supplier_columns(sheet: Any, header_row: int) -> dict[str, dict[str, int]]:
    suppliers: dict[str, dict[str, int]] = {}
    for column in range(1, sheet.max_column + 1):
        header_value = _text(sheet.cell(header_row, column).value)
        header_key = _header_key(header_value)
        suffixes = {
            "unit price": "rate",
            "rate": "rate",
            "price": "rate",
            "amount": "amount",
        }
        kind = suffixes.get(header_key)
        supplier_name = ""
        if kind is None:
            for suffix, suffix_kind in suffixes.items():
                if header_key.endswith(f" {suffix}"):
                    supplier_name = header_key[: -(len(suffix) + 1)].strip()
                    kind = suffix_kind
                    break
        if kind is None:
            continue

        if not supplier_name:
            for previous_row in range(header_row - 1, max(0, header_row - 4), -1):
                candidate = _text(sheet.cell(previous_row, column).value)
                if candidate and _header_key(candidate) not in GENERIC_HEADER_WORDS:
                    supplier_name = candidate
                    break
        if not supplier_name:
            continue

        suppliers.setdefault(supplier_name, {})[kind] = column
    return suppliers


def _metadata(sheet: Any) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for row in sheet.iter_rows(min_row=1, max_row=min(sheet.max_row, 15), values_only=True):
        if {"item", "quantity"}.issubset({_field_key(value) for value in row}):
            break
        for index, cell_value in enumerate(row):
            key = _header_key(cell_value)
            if key in {"prepared by", "date", "project", "project name", "supplier", "vendor"} and index + 1 < len(row):
                result_key = "project" if key == "project name" else "supplier" if key == "vendor" else key.replace(" ", "_")
                result[result_key] = row[index + 1]
    return result


def _sheet_kind(name: str) -> str | None:
    key = _header_key(name)
    if key in {"summary for 2026", "pivot table"}:
        return "reference"
    if key == "categories":
        return "categories"
    if key.startswith("order list week"):
        return "purchase_order"
    if "expenditure" in key or "inventory 2026" in key:
        return "stock_in"
    if "overall list" in key:
        return "ppe_issue"
    if "list of items" in key:
        return "purchase_request_line"
    if key.startswith("week ") or "procurement request" in key or "project" in key:
        return "purchase_request"
    return None


def _date_warnings(value: Any) -> tuple[str | None, list[str]]:
    if value is None or _text(value) == "":
        return None, []
    parsed = _date_value(value)
    if parsed is None:
        return None, [f"Unrecognized date format: {_text(value)}"]
    if parsed.year not in EXPECTED_YEARS:
        return parsed.isoformat(), [f"Date year {parsed.year} is outside the expected 2025–2026 range."]
    return parsed.isoformat(), []


def _header_columns(sheet: Any, header_row: int) -> dict[str, int]:
    columns: dict[str, int] = {}
    for column in range(1, sheet.max_column + 1):
        field_name = ""
        for candidate_row in range(header_row, max(0, header_row - 3), -1):
            field_name = _field_key(sheet.cell(candidate_row, column).value)
            if field_name:
                break
        if field_name and field_name not in columns:
            columns[field_name] = column
    return columns


def _cell(row: tuple[Any, ...], columns: dict[str, int], field_name: str) -> Any:
    column = columns.get(field_name)
    return row[column - 1] if column and column <= len(row) else None


def _suggestions(names: set[str]) -> list[dict[str, Any]]:
    suggestions: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    entries = sorted(name for name in names if name)
    for name in entries:
        canonical = SUPPLIER_ALIASES.get(_header_key(name))
        if canonical and canonical != name:
            pair = tuple(sorted((name, canonical)))
            if pair not in seen:
                suggestions.append({
                    "names": list(pair),
                    "similarity": 1.0,
                    "match_type": "known_alias",
                    "requires_manual_confirmation": True,
                })
                seen.add(pair)
    for index, first in enumerate(entries):
        for second in entries[index + 1 :]:
            score = SequenceMatcher(None, _header_key(first), _header_key(second)).ratio()
            if 0.84 <= score < 1:
                pair = (first, second)
                if pair not in seen:
                    suggestions.append({
                        "names": [first, second],
                        "similarity": round(score, 3),
                        "requires_manual_confirmation": True,
                    })
                    seen.add(pair)
    return suggestions


def _month_key(value: Any) -> str | None:
    parsed = _date_value(value)
    if parsed:
        return f"{parsed.year:04d}-{parsed.month:02d}"
    key = _header_key(value)
    for month_name, month in MONTH_NAMES.items():
        if key == month_name or key.startswith(f"{month_name} "):
            year_match = re.search(r"\b(20\d{2})\b", key)
            return f"{year_match.group(1) if year_match else '2026'}-{month:02d}"
    return None


def _reference_totals(rows: list[list[Any]], dimension: str) -> dict[str, Decimal] | None:
    dimension_aliases = {
        "supplier": {"supplier", "vendor", "supplier name", "vendor name"},
        "category": {"category", "item category", "product category"},
    }
    amount_aliases = {"amount", "total", "grand total", "sum of amount", "expenditure"}
    month_aliases = {"month", "period", "invoice month"}
    header_index = None
    entity_column = None
    month_column = None
    amount_column = None
    month_columns: dict[int, str] = {}
    for row_index, row in enumerate(rows[:30]):
        keys = [_header_key(value) for value in row]
        for column, key in enumerate(keys):
            if key in dimension_aliases[dimension]:
                header_index = row_index
                entity_column = column
            elif key in month_aliases:
                month_column = column
            elif key in amount_aliases:
                amount_column = column
        if header_index is not None:
            for column, value in enumerate(row):
                month = _month_key(value)
                if month:
                    month_columns[column] = month
            break
    if header_index is None or entity_column is None:
        return None
    totals: dict[str, Decimal] = {}
    for row in rows[header_index + 1:]:
        if entity_column >= len(row):
            continue
        name = _text(row[entity_column])
        if not name or _header_key(name) in {"total", "grand total"}:
            continue
        if month_column is not None and amount_column is not None:
            if month_column >= len(row) or amount_column >= len(row):
                continue
            month = _month_key(row[month_column])
            amount = _decimal(row[amount_column])
            if month and amount is not None:
                totals[f"{month}|{name}"] = amount
        elif month_columns:
            for column, month in month_columns.items():
                if column >= len(row):
                    continue
                amount = _decimal(row[column])
                if amount is not None:
                    totals[f"{month}|{name}"] = amount
        elif amount_column is not None and amount_column < len(row):
            amount = _decimal(row[amount_column])
            if amount is not None:
                totals[name] = amount
    return totals


def _workbook_reconciliation(report: ImportReport) -> dict[str, Any]:
    supplier_totals: dict[str, Decimal] = {}
    category_totals: dict[str, Decimal] = {}
    for row in report.rows:
        if row.record_type not in {"purchase_order_line", "stock_in"} or row.errors:
            continue
        data = row.normalized_data
        supplier = data.get("supplier") or data.get("proposed_supplier")
        category = data.get("category") or normalize_category(
            f"{data.get('item') or ''} {data.get('description') or ''}"
        )
        quantity = _decimal(data.get("quantity"))
        amount = _decimal(data.get("amount"))
        unit_price = _decimal(data.get("unit_price"))
        if amount is None and quantity is not None and unit_price is not None:
            amount = quantity * unit_price
        parsed_date = _date_value(data.get("date"))
        if amount is None:
            continue
        amount = amount.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
        if supplier and parsed_date:
            key = f"{parsed_date.year:04d}-{parsed_date.month:02d}|{supplier}"
            supplier_totals[key] = supplier_totals.get(key, Decimal("0")) + amount
        if category:
            category_totals[category] = category_totals.get(category, Decimal("0")) + amount

    reference_supplier = _reference_totals(
        report.reference_sheets.get("Summary for 2026", []),
        "supplier",
    )
    reference_category = _reference_totals(
        report.reference_sheets.get("Pivot Table", []),
        "category",
    )
    differences: dict[str, list[dict[str, str]]] = {"monthly_supplier": [], "category": []}
    if reference_supplier is not None:
        for key in sorted(set(supplier_totals) | set(reference_supplier)):
            actual = supplier_totals.get(key, Decimal("0"))
            expected = reference_supplier.get(key, Decimal("0"))
            variance = (actual - expected).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
            if abs(variance) > AMOUNT_TOLERANCE:
                differences["monthly_supplier"].append({
                    "key": key,
                    "expected": str(expected.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)),
                    "actual": str(actual.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)),
                    "difference": str(variance),
                })
    if reference_category is not None:
        for key in sorted(set(category_totals) | set(reference_category)):
            actual = category_totals.get(key, Decimal("0"))
            expected = reference_category.get(key, Decimal("0"))
            variance = (actual - expected).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
            if abs(variance) > AMOUNT_TOLERANCE:
                differences["category"].append({
                    "key": key,
                    "expected": str(expected.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)),
                    "actual": str(actual.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)),
                    "difference": str(variance),
                })
    parsed_both = reference_supplier is not None and reference_category is not None
    return {
        "status": "compared" if parsed_both else "pending_layout_review",
        "monthly_supplier_totals": {
            key: str(value.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP))
            for key, value in sorted(supplier_totals.items())
        },
        "category_totals": {
            key: str(value.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP))
            for key, value in sorted(category_totals.items())
        },
        "references_parsed": {
            "monthly_supplier": reference_supplier is not None,
            "category": reference_category is not None,
        },
        "differences": differences,
        "note": (
            "Summary and pivot layouts were not both recognized; confirm the workbook layout before relying on reconciliation."
            if not parsed_both else "Differences compare imported order/stock totals with workbook reference totals."
        ),
    }


def _parse_categories(sheet: Any, report: ImportReport, supplier_names: set[str]) -> None:
    headers = [_text(sheet.cell(1, column).value) for column in range(1, sheet.max_column + 1)]
    lookup_types = {
        "vendor": "supplier",
        "vendors": "supplier",
        "supplier": "supplier",
        "suppliers": "supplier",
        "item": "item",
        "items": "item",
        "payment method": "payment_method",
        "payment methods": "payment_method",
        "receiver": "receiver",
        "receivers": "receiver",
        "staff": "receiver",
        "unit": "unit",
        "units": "unit",
    }
    for row_number, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), start=2):
        for column_number, value in enumerate(row, start=1):
            text = _text(value)
            if not text:
                continue
            list_name = headers[column_number - 1] or f"column_{column_number}"
            lookup_type = lookup_types.get(_header_key(list_name), "category")
            normalized_value = text
            if lookup_type == "supplier":
                normalized_value, _ = canonical_supplier(text)
                normalized_value = normalized_value or text
            elif lookup_type == "unit":
                normalized_value = normalize_unit(text) or text
            elif lookup_type == "category":
                normalized_value = normalize_category(text) or text
            report.rows.append(ImportedRow(
                record_type="lookup_seed",
                source_sheet=sheet.title,
                source_row=row_number,
                raw_data={"column": column_number, "value": _json_value(value)},
                normalized_data={
                    "list_name": list_name,
                    "lookup_type": lookup_type,
                    "value": normalized_value,
                },
                source_column=column_number,
            ))
            if lookup_type == "supplier":
                supplier_names.add(text)
                supplier_names.add(normalized_value)


def _parse_table_sheet(sheet: Any, kind: str, report: ImportReport, supplier_names: set[str]) -> None:
    header_row = _find_header_row(sheet)
    if header_row is None:
        report.sheet_issues.append({
            "sheet": sheet.title,
            "issue": "Could not identify a header row containing item, quantity, and unit columns.",
        })
        return

    columns = _header_columns(sheet, header_row)
    quote_columns = _supplier_columns(sheet, header_row) if kind == "purchase_request" else {}
    metadata = _metadata(sheet)
    if kind == "purchase_request":
        for supplier in quote_columns:
            supplier_names.add(supplier)

    week_match = re.search(r"\bweek\s*(\d+)\b", sheet.title, re.IGNORECASE)
    sheet_date = _date_value(metadata.get("date"))
    for row_number, values in enumerate(
        sheet.iter_rows(min_row=header_row + 1, values_only=True),
        start=header_row + 1,
    ):
        raw = {str(index + 1): _json_value(value) for index, value in enumerate(values) if value is not None}
        item = _text(_cell(values, columns, "item"))
        description = _text(_cell(values, columns, "description"))
        quantity = _decimal(_cell(values, columns, "quantity"))
        unit = normalize_unit(_cell(values, columns, "unit"))
        if not (item or description or quantity is not None):
            continue

        warnings: list[str] = []
        errors: list[str] = []
        if quantity is None or quantity <= 0:
            errors.append("Quantity is missing or not greater than zero.")
        if not item and not description:
            errors.append("Row has no item name or description.")

        raw_date = _cell(values, columns, "date") or metadata.get("date") or sheet_date
        parsed_date, date_issues = _date_warnings(raw_date)
        warnings.extend(date_issues)
        data: dict[str, Any] = {
            "item": item or None,
            "description": description or item or None,
            "quantity": str(quantity) if quantity is not None else None,
            "unit": unit,
            "date": parsed_date,
            "prepared_by": _text(_cell(values, columns, "prepared_by") or metadata.get("prepared_by")) or None,
            "project": _text(metadata.get("project")) or (sheet.title if "project" in _header_key(sheet.title) else None),
            "week_number": int(week_match.group(1)) if week_match else None,
            "source_sheet": sheet.title,
            "source_row": row_number,
        }

        supplier_value = _text(_cell(values, columns, "supplier"))
        proposed_value = _text(_cell(values, columns, "proposed_supplier"))
        remarks = _text(_cell(values, columns, "remarks") or _cell(values, columns, "purpose"))
        if supplier_value:
            canonical, alias = canonical_supplier(supplier_value)
            data["supplier"] = canonical
            supplier_names.add(supplier_value)
            if alias:
                supplier_names.add(alias)
        if proposed_value:
            canonical, alias = canonical_supplier(proposed_value)
            data["proposed_supplier"] = canonical
            supplier_names.add(proposed_value)
            if alias:
                supplier_names.add(alias)
        if remarks:
            data["remarks"] = remarks
        category = normalize_category(_cell(values, columns, "category"))
        if category:
            data["category"] = category
        elif description or item:
            data["category"] = normalize_category(f"{item} {description}")
        if kind == "purchase_order" and not data.get("supplier") and metadata.get("supplier"):
            raw_supplier = _text(metadata.get("supplier"))
            canonical, alias = canonical_supplier(raw_supplier)
            data["supplier"] = canonical
            supplier_names.add(raw_supplier)
            if alias:
                supplier_names.add(alias)

        if quote_columns:
            quotes = []
            for raw_supplier, quote_fields in quote_columns.items():
                supplier, alias = canonical_supplier(raw_supplier)
                supplier = supplier or raw_supplier
                supplier_names.add(raw_supplier)
                if alias:
                    supplier_names.add(alias)
                rate = _decimal(values[quote_fields["rate"] - 1]) if "rate" in quote_fields and quote_fields["rate"] <= len(values) else None
                amount = _decimal(values[quote_fields["amount"] - 1]) if "amount" in quote_fields and quote_fields["amount"] <= len(values) else None
                if rate is None and amount is None:
                    continue
                quote = {"supplier": supplier, "rate": _money(rate), "amount": _money(amount)}
                quotes.append(quote)
                if rate is not None and quantity is not None and amount is not None:
                    expected = (quantity * rate).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
                    if abs(expected - amount.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)) > AMOUNT_TOLERANCE:
                        warnings.append(
                            f"{supplier}: amount {amount} does not match quantity × rate ({expected})."
                        )
            data["quotes"] = quotes
            if proposed_value:
                proposed = next((quote for quote in quotes if quote["supplier"] == data.get("proposed_supplier")), None)
                priced = [quote for quote in quotes if quote["rate"] is not None]
                if proposed and proposed["rate"] is not None and priced:
                    lowest = min(Decimal(quote["rate"]) for quote in priced)
                    has_reason = any(term in _header_key(remarks) for term in NON_LOWEST_REASON_TERMS)
                    if Decimal(proposed["rate"]) > lowest + AMOUNT_TOLERANCE and not has_reason:
                        warnings.append("Proposed supplier is not the lowest quote and no reason was recorded.")

        if kind in {"purchase_order", "stock_in"}:
            rate = _decimal(_cell(values, columns, "unit_price") or _cell(values, columns, "rate"))
            amount = _decimal(_cell(values, columns, "amount"))
            if rate is None and amount is None:
                errors.append("Unit price or amount is missing.")
            if rate is not None:
                data["unit_price"] = _money(rate)
            if amount is not None:
                data["amount"] = _money(amount)
            if rate is not None and quantity is not None and amount is not None:
                expected = (quantity * rate).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
                if abs(expected - amount.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)) > AMOUNT_TOLERANCE:
                    warnings.append(f"Amount {amount} does not match quantity × unit price ({expected}).")
            for field_name in ("payment_method", "receiver", "purpose", "technician", "size", "phone", "contact"):
                value = _text(_cell(values, columns, field_name))
                if value:
                    data[field_name] = normalize_phone(value) if field_name == "phone" else value
            if "supplier" in data:
                data["supplier"] = canonical_supplier(data["supplier"])[0]

        if kind == "purchase_order":
            record_type = "purchase_order_line"
        elif kind == "stock_in":
            record_type = "stock_in"
        elif kind == "ppe_issue":
            record_type = "ppe_issue_line"
        else:
            record_type = kind

        report.rows.append(ImportedRow(
            record_type=record_type,
            source_sheet=sheet.title,
            source_row=row_number,
            raw_data=raw,
            normalized_data=data,
            warnings=warnings,
            errors=errors,
        ))


def import_workbook(path: str | Path) -> ImportReport:
    workbook_path = Path(path)
    workbook = load_workbook(workbook_path, read_only=True, data_only=True)
    report = ImportReport(filename=workbook_path.name)
    supplier_names: set[str] = set()
    found_reference_sheets: list[str] = []

    try:
        for sheet in workbook.worksheets:
            kind = _sheet_kind(sheet.title)
            if kind == "reference":
                report.reference_sheets[sheet.title] = [
                    [_json_value(value) for value in row]
                    for row in sheet.iter_rows(values_only=True)
                ]
                found_reference_sheets.append(sheet.title)
            elif kind == "categories":
                _parse_categories(sheet, report, supplier_names)
            elif kind:
                _parse_table_sheet(sheet, kind, report, supplier_names)
            else:
                report.ignored_sheets.append(sheet.title)
    finally:
        workbook.close()

    report.supplier_merge_suggestions = _suggestions(supplier_names)
    expected_references = {"Summary for 2026", "Pivot Table"}
    report.summary_validation = {
        **_workbook_reconciliation(report),
        "found_reference_sheets": found_reference_sheets,
        "missing_reference_sheets": sorted(
            name for name in expected_references
            if _header_key(name) not in {_header_key(found) for found in found_reference_sheets}
        ),
    }
    return report


def save_staging_report(path: str | Path, payload: dict[str, Any]) -> None:
    output_path = Path(path)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def stage_import(report: ImportReport) -> int:
    has_errors = any(row.errors for row in report.rows)
    with SessionLocal() as session:
        batch = ImportBatch(
            filename=report.filename,
            status="Needs review" if has_errors else "Staged",
            dry_run=False,
            report=report.as_dict(),
        )
        session.add(batch)
        session.flush()
        session.add_all([
            ImportRow(
                batch_id=batch.id,
                source_sheet=row.source_sheet,
                source_row=row.source_row,
                source_column=row.source_column,
                record_type=row.record_type,
                status=row.status,
                raw_data=row.raw_data,
                normalized_data=row.normalized_data,
                warnings=row.warnings,
                errors=row.errors,
            )
            for row in report.rows
        ])
        session.commit()
        return batch.id


def _import_supplier(session, name: str | None) -> Supplier | None:
    canonical, _ = canonical_supplier(name) if name else (None, None)
    if not canonical:
        return None
    normalized = " ".join(canonical.casefold().split())
    supplier = session.scalar(select(Supplier).where(
        Supplier.normalized_name == normalized,
        Supplier.deleted_at.is_(None),
    ))
    if supplier is None:
        supplier = Supplier(name=canonical, normalized_name=normalized)
        session.add(supplier)
        session.flush()
    return supplier


def _import_unit(session, code: str | None) -> Unit | None:
    if not code:
        return None
    unit = session.scalar(select(Unit).where(Unit.code == code))
    if unit is None:
        unit = Unit(code=code, display_name=code.title())
        session.add(unit)
        session.flush()
    return unit


def _import_category(session, name: str | None) -> Category | None:
    if not name:
        return None
    category_name = normalize_category(name) or name.strip()
    category = session.scalar(select(Category).where(func.lower(Category.name) == category_name.lower()))
    if category is None:
        category = Category(name=category_name)
        session.add(category)
        session.flush()
    return category


def _import_item(session, data: dict[str, Any]) -> Item:
    name = _text(data.get("item") or data.get("description")) or "Imported item"
    item = session.scalar(select(Item).where(func.lower(Item.name) == name.lower(), Item.deleted_at.is_(None)))
    if item is None:
        category = _import_category(session, data.get("category"))
        unit = _import_unit(session, data.get("unit"))
        item = Item(
            name=name[:240],
            description=_text(data.get("description")) or None,
            category_id=category.id if category else None,
            unit_id=unit.id if unit else None,
        )
        session.add(item)
        session.flush()
    return item


def _import_project(session, name: str | None) -> Project | None:
    if not name:
        return None
    normalized_name = name.strip()
    project = session.scalar(select(Project).where(
        func.lower(Project.name) == normalized_name.lower(),
        Project.deleted_at.is_(None),
    ))
    if project is not None:
        return project
    code = re.sub(r"[^A-Z0-9]+", "-", normalized_name.upper()).strip("-")[:64] or "IMPORTED"
    base_code = code
    suffix = 1
    while session.scalar(select(Project.id).where(Project.code == code)) is not None:
        tail = f"-{suffix}"
        code = f"{base_code[:64 - len(tail)]}{tail}"
        suffix += 1
    project = Project(code=code, name=normalized_name[:200])
    session.add(project)
    session.flush()
    return project


def _import_date(value: Any) -> date:
    parsed = _date_value(value)
    return parsed or business_today()


def commit_import(report: ImportReport) -> dict[str, Any]:
    ready_rows = [row for row in report.rows if not row.errors]
    with SessionLocal() as session:
        batch = ImportBatch(
            filename=report.filename,
            status="Committing",
            dry_run=False,
            report=report.as_dict(),
        )
        session.add(batch)
        session.flush()
        session.add_all([
            ImportRow(
                batch_id=batch.id,
                source_sheet=row.source_sheet,
                source_row=row.source_row,
                source_column=row.source_column,
                record_type=row.record_type,
                status=row.status,
                raw_data=row.raw_data,
                normalized_data=row.normalized_data,
                warnings=row.warnings,
                errors=row.errors,
            )
            for row in report.rows
        ])
        imported = {
            "purchase_requests": 0,
            "purchase_orders": 0,
            "stock_receipts": 0,
            "lookups": 0,
            "skipped_error_rows": sum(bool(row.errors) for row in report.rows),
        }
        request_groups: dict[tuple[str, str, str], list[ImportedRow]] = {}
        order_groups: dict[tuple[str, str, str, str], list[ImportedRow]] = {}
        for row in ready_rows:
            data = row.normalized_data
            if row.record_type == "lookup_seed":
                lookup_type = data.get("lookup_type")
                value = _text(data.get("value"))
                if lookup_type == "supplier":
                    _import_supplier(session, value)
                elif lookup_type == "unit":
                    _import_unit(session, normalize_unit(value))
                elif lookup_type == "category":
                    _import_category(session, value)
                elif lookup_type == "payment_method":
                    if not session.scalar(select(PaymentMethod.id).where(func.lower(PaymentMethod.name) == value.lower())):
                        session.add(PaymentMethod(name=value[:100]))
                imported["lookups"] += 1
            elif row.record_type == "purchase_request":
                key = (
                    row.source_sheet,
                    _text(data.get("date")),
                    _text(data.get("project")),
                )
                request_groups.setdefault(key, []).append(row)
            elif row.record_type == "purchase_order_line":
                key = (
                    row.source_sheet,
                    _text(data.get("supplier")),
                    _text(data.get("project")),
                    _text(data.get("date")),
                )
                order_groups.setdefault(key, []).append(row)

        for (sheet_name, request_date_value, project_name), rows in request_groups.items():
            request_date = _import_date(request_date_value)
            project = _import_project(session, project_name or None)
            request = PurchaseRequest(
                request_number=f"TEMP-{uuid.uuid4().hex}",
                request_date=request_date,
                required_by=request_date,
                week_number=rows[0].normalized_data.get("week_number"),
                project_id=project.id if project else None,
                status=RequestStatus.APPROVED.value,
                source="import",
                source_sheet=sheet_name,
                source_row=rows[0].source_row,
            )
            session.add(request)
            session.flush()
            request.request_number = f"IMP-PR-{request.id:06d}"
            quotes_by_supplier: dict[int, SupplierQuote] = {}
            for imported_row in rows:
                data = imported_row.normalized_data
                supplier = _import_supplier(session, data.get("proposed_supplier"))
                item = _import_item(session, data)
                unit = _import_unit(session, data.get("unit"))
                line = PurchaseRequestLine(
                    request_id=request.id,
                    item_id=item.id,
                    description=_text(data.get("description") or data.get("item")) or item.name,
                    quantity=Decimal(str(data["quantity"])),
                    unit_id=unit.id if unit else None,
                    proposed_supplier_id=supplier.id if supplier else None,
                    proposed_supplier_reason=data.get("remarks"),
                    source_sheet=imported_row.source_sheet,
                    source_row=imported_row.source_row,
                )
                session.add(line)
                session.flush()
                for quote_data in data.get("quotes", []):
                    quote_supplier = _import_supplier(session, quote_data.get("supplier"))
                    if quote_supplier is None or quote_data.get("rate") is None:
                        continue
                    quote = quotes_by_supplier.get(quote_supplier.id)
                    if quote is None:
                        quote = SupplierQuote(
                            request_id=request.id,
                            supplier_id=quote_supplier.id,
                            source_sheet=imported_row.source_sheet,
                            source_row=imported_row.source_row,
                        )
                        session.add(quote)
                        session.flush()
                        quotes_by_supplier[quote_supplier.id] = quote
                    rate = Decimal(str(quote_data["rate"]))
                    amount = (line.quantity * rate).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
                    session.add(QuotationLine(
                        quote_id=quote.id,
                        request_line_id=line.id,
                        rate=rate,
                        amount=amount,
                        source_sheet=imported_row.source_sheet,
                        source_row=imported_row.source_row,
                    ))
            imported["purchase_requests"] += 1

        for (sheet_name, supplier_name, project_name, order_date_value), rows in order_groups.items():
            supplier = _import_supplier(session, supplier_name or None)
            if supplier is None:
                continue
            project = _import_project(session, project_name or None)
            order_date = _import_date(order_date_value)
            order = PurchaseOrder(
                order_number=f"TEMP-{uuid.uuid4().hex}",
                supplier_id=supplier.id,
                project_id=project.id if project else None,
                order_date=order_date,
                delivery_status="Open",
                source="import",
                source_sheet=sheet_name,
                source_row=rows[0].source_row,
            )
            session.add(order)
            session.flush()
            order.order_number = f"IMP-PO-{order.id:06d}"
            for imported_row in rows:
                data = imported_row.normalized_data
                quantity = Decimal(str(data["quantity"]))
                unit_price = Decimal(str(data.get("unit_price") or "0"))
                item = _import_item(session, data)
                session.add(PurchaseOrderLine(
                    purchase_order_id=order.id,
                    item_id=item.id,
                    description=_text(data.get("description") or data.get("item")) or item.name,
                    quantity=quantity,
                    unit_price=unit_price,
                    subtotal=(quantity * unit_price).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP),
                    source_sheet=imported_row.source_sheet,
                    source_row=imported_row.source_row,
                ))
            imported["purchase_orders"] += 1

        for imported_row in ready_rows:
            if imported_row.record_type != "stock_in":
                continue
            data = imported_row.normalized_data
            quantity = Decimal(str(data["quantity"]))
            unit_price_value = data.get("unit_price")
            if unit_price_value is None and data.get("amount") is not None:
                unit_price_value = str(Decimal(str(data["amount"])) / quantity)
            if unit_price_value is None:
                continue
            unit_cost = Decimal(str(unit_price_value)).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
            item = _import_item(session, data)
            project = _import_project(session, data.get("project"))
            store = session.scalar(select(Store).where(Store.deleted_at.is_(None)).order_by(Store.id))
            if store is None:
                store = Store(name="Main Store")
                session.add(store)
                session.flush()
            receipt_date = _import_date(data.get("date"))
            receipt = GoodsReceipt(
                received_date=receipt_date,
                store_id=store.id,
                project_id=project.id if project else None,
                purpose=data.get("purpose"),
                source="import",
                source_sheet=imported_row.source_sheet,
                source_row=imported_row.source_row,
            )
            session.add(receipt)
            session.flush()
            session.add(GoodsReceiptLine(
                receipt_id=receipt.id,
                item_id=item.id,
                description=_text(data.get("description") or data.get("item")) or item.name,
                quantity=quantity,
                unit_cost=unit_cost,
                source_sheet=imported_row.source_sheet,
                source_row=imported_row.source_row,
            ))
            balance = _balance(session, item.id, store.id)
            _increase_balance(balance, quantity, unit_cost)
            session.add(StockMovement(
                item_id=item.id,
                store_id=store.id,
                movement_type=StockMovementType.RECEIPT.value,
                movement_date=_movement_time(receipt_date),
                quantity=quantity,
                unit_cost=unit_cost,
                project_id=project.id if project else None,
                purpose=data.get("purpose") or "Imported historical stock receipt",
                source="import",
                source_sheet=imported_row.source_sheet,
                source_row=imported_row.source_row,
            ))
            imported["stock_receipts"] += 1

        batch.status = "Committed"
        batch.report = report.as_dict() | {"commit_counts": imported}
        session.commit()
        return {"batch_id": batch.id, "counts": imported}


def main() -> None:
    parser = argparse.ArgumentParser(description="Preview or import an Alwen procurement workbook.")
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--report", type=Path, help="Write the dry-run report to this JSON file.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Preview only; this is the default.")
    mode.add_argument("--commit", action="store_true", help="Import valid rows into live procurement and stock records.")
    mode.add_argument("--apply", action="store_true", help="Persist parsed rows to the import staging tables.")
    args = parser.parse_args()
    report = import_workbook(args.workbook)
    payload = report.as_dict()
    if args.apply:
        payload["staged_batch_id"] = stage_import(report)
        payload["mode"] = "staged"
    elif args.commit:
        payload["commit"] = commit_import(report)
        payload["mode"] = "committed"
    else:
        payload["mode"] = "dry-run"
    rendered = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.report:
        save_staging_report(args.report, payload)
    print(rendered)


if __name__ == "__main__":
    main()
