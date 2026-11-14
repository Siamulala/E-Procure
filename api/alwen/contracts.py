import os
import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from alwen.auth import require_roles
from alwen.database import get_db
from alwen.models import (
    Contract,
    ContractLine,
    Item,
    PurchaseOrder,
    PurchaseOrderLine,
    Supplier,
    User,
)
from alwen.time_utils import business_today


router = APIRouter(prefix="/contracts", tags=["contracts"])
WRITE_ROLES = ("Admin", "Procurement Officer")
READ_ROLES = ("Admin", "Procurement Officer", "Approver", "Director", "Finance")
UPLOAD_ROOT = Path(os.getenv(
    "ALWEN_UPLOAD_DIR",
    str(Path(__file__).resolve().parents[1] / "uploads"),
)).resolve()
MAX_CONTRACT_FILE_SIZE = 20 * 1024 * 1024


class ContractLineInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item_id: int | None = Field(default=None, gt=0)
    description: str = Field(min_length=1, max_length=4000)
    agreed_price: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    max_quantity: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=3)


class ContractCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_number: str = Field(min_length=1, max_length=120)
    supplier_id: int = Field(gt=0)
    start_date: date
    end_date: date
    payment_terms: str | None = Field(default=None, max_length=100)
    lines: list[ContractLineInput] = Field(min_length=1)


def _data(db: Session, contract: Contract) -> dict:
    lines = db.scalars(
        select(ContractLine).where(ContractLine.contract_id == contract.id).order_by(ContractLine.id)
    ).all()
    return {
        "id": contract.id,
        "contract_number": contract.contract_number,
        "supplier_id": contract.supplier_id,
        "start_date": contract.start_date.isoformat(),
        "end_date": contract.end_date.isoformat(),
        "payment_terms": contract.payment_terms,
        "status": contract.status,
        "document_path": contract.document_path,
        "lines": [{
            "id": line.id,
            "item_id": line.item_id,
            "description": line.description,
            "agreed_price": str(line.agreed_price),
            "max_quantity": str(line.max_quantity) if line.max_quantity is not None else None,
            "called_off_quantity": str(line.called_off_quantity),
            "remaining_quantity": (
                str(max(Decimal("0"), line.max_quantity - line.called_off_quantity))
                if line.max_quantity is not None else None
            ),
        } for line in lines],
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_contract(
    payload: ContractCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> dict:
    supplier = db.get(Supplier, payload.supplier_id)
    if supplier is None or supplier.deleted_at is not None:
        raise HTTPException(status_code=422, detail="Supplier does not exist or is inactive.")
    if payload.start_date > payload.end_date:
        raise HTTPException(status_code=422, detail="The contract start date must be on or before its end date.")
    if db.scalar(select(Contract.id).where(Contract.contract_number == payload.contract_number.strip())):
        raise HTTPException(status_code=409, detail="Contract number already exists.")
    for line in payload.lines:
        if line.item_id is not None:
            item = db.get(Item, line.item_id)
            if item is None or item.deleted_at is not None:
                raise HTTPException(status_code=422, detail=f"Item {line.item_id} does not exist or is inactive.")
    contract = Contract(
        contract_number=payload.contract_number.strip(),
        supplier_id=supplier.id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        payment_terms=payload.payment_terms.strip() if payload.payment_terms else None,
        status="draft",
    )
    db.add(contract)
    db.flush()
    for line in payload.lines:
        db.add(ContractLine(
            contract_id=contract.id,
            item_id=line.item_id,
            description=line.description.strip(),
            agreed_price=line.agreed_price,
            max_quantity=line.max_quantity,
        ))
    db.commit()
    db.refresh(contract)
    return _data(db, contract)


@router.get("")
def list_contracts(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> dict:
    contracts = db.scalars(
        select(Contract).where(Contract.deleted_at.is_(None)).order_by(Contract.end_date, Contract.id)
    ).all()
    return {"items": [_data(db, row) for row in contracts]}


@router.post("/{contract_id}/activate")
def activate_contract(
    contract_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> dict:
    contract = db.get(Contract, contract_id)
    if contract is None or contract.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Contract not found.")
    if contract.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft contracts can be activated.")
    if contract.end_date < business_today():
        raise HTTPException(status_code=409, detail="An expired contract cannot be activated.")
    contract.status = "active"
    db.commit()
    return _data(db, contract)


@router.post("/{contract_id}/terminate")
def terminate_contract(
    contract_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> dict:
    contract = db.get(Contract, contract_id)
    if contract is None or contract.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Contract not found.")
    if contract.status != "active":
        raise HTTPException(status_code=409, detail="Only active contracts can be terminated.")
    contract.status = "terminated"
    db.commit()
    return _data(db, contract)


@router.post("/{contract_id}/document")
async def upload_contract_document(
    contract_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> dict:
    contract = db.get(Contract, contract_id)
    if contract is None or contract.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Contract not found.")
    if Path(file.filename or "").suffix.lower() != ".pdf" or file.content_type != "application/pdf":
        raise HTTPException(status_code=415, detail="Signed contract documents must be PDF files.")
    prefix = await file.read(5)
    if prefix != b"%PDF-":
        raise HTTPException(status_code=415, detail="The uploaded file is not a valid PDF.")
    await file.seek(0)
    directory = UPLOAD_ROOT / "contracts" / str(contract.id)
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / f"{uuid.uuid4().hex}.pdf"
    size = 0
    try:
        with destination.open("xb") as target:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_CONTRACT_FILE_SIZE:
                    raise HTTPException(status_code=413, detail="Contract files are limited to 20 MB.")
                target.write(chunk)
    except (OSError, HTTPException):
        destination.unlink(missing_ok=True)
        raise
    contract.document_path = str(destination.relative_to(UPLOAD_ROOT))
    db.commit()
    return {"contract_id": contract.id, "document_path": contract.document_path}


@router.get("/reports/price-variance")
def contract_price_variance(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> dict:
    rows = db.execute(
        select(
            PurchaseOrder.order_number,
            PurchaseOrder.supplier_id,
            PurchaseOrderLine.id,
            PurchaseOrderLine.description,
            PurchaseOrderLine.unit_price,
            Contract.contract_number,
            ContractLine.agreed_price,
        )
        .join(PurchaseOrderLine, PurchaseOrderLine.purchase_order_id == PurchaseOrder.id)
        .join(ContractLine, ContractLine.id == PurchaseOrderLine.contract_line_id)
        .join(Contract, Contract.id == ContractLine.contract_id)
        .where(PurchaseOrderLine.unit_price != ContractLine.agreed_price)
    ).all()
    return {"items": [{
        "order_number": row.order_number,
        "supplier_id": row.supplier_id,
        "purchase_order_line_id": row.id,
        "description": row.description,
        "paid_price": str(row.unit_price),
        "contract_number": row.contract_number,
        "contract_price": str(row.agreed_price),
        "variance": str(row.unit_price - row.agreed_price),
    } for row in rows]}
