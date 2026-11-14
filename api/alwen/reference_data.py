from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from alwen.audit import write_audit
from alwen.auth import require_roles
from alwen.database import get_db
from alwen.models import Category, Item, Project, Staff, Store, Supplier, Unit, User
from alwen.schemas import ItemCreate, StaffCreate, StoreCreate, SupplierCreate


router = APIRouter(tags=["master data"])
READ_ROLES = ("Admin", "Procurement Officer", "Approver", "Director", "Store Keeper", "Project Manager", "Finance")
WRITE_ROLES = ("Admin", "Procurement Officer")


def _page(statement, model, db: Session, offset: int, limit: int) -> tuple[list, int]:
    total = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    records = db.scalars(statement.order_by(model.id).offset(offset).limit(limit)).all()
    return records, total


@router.get("/categories")
def list_categories(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*READ_ROLES)),
) -> list[dict]:
    rows = db.scalars(select(Category).where(Category.deleted_at.is_(None)).order_by(Category.name)).all()
    return [{"id": row.id, "name": row.name} for row in rows]


@router.get("/units")
def list_units(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*READ_ROLES)),
) -> list[dict]:
    rows = db.scalars(select(Unit).where(Unit.deleted_at.is_(None)).order_by(Unit.code)).all()
    return [{"id": row.id, "code": row.code, "display_name": row.display_name} for row in rows]


@router.get("/projects")
def list_projects(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*READ_ROLES)),
) -> list[dict]:
    statement = select(Project).where(Project.deleted_at.is_(None))
    if user.role == "Project Manager":
        statement = statement.where(Project.id == user.project_id)
    rows = db.scalars(statement.order_by(Project.name)).all()
    return [{"id": row.id, "code": row.code, "name": row.name} for row in rows]


@router.get("/stores")
def list_stores(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*READ_ROLES)),
) -> list[dict]:
    rows = db.scalars(select(Store).where(Store.deleted_at.is_(None)).order_by(Store.name)).all()
    return [{"id": row.id, "name": row.name, "location": row.location} for row in rows]


@router.post("/stores", status_code=status.HTTP_201_CREATED)
def create_store(
    payload: StoreCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("Admin")),
) -> dict:
    name = payload.name.strip()
    if db.scalar(select(Store.id).where(func.lower(Store.name) == name.lower(), Store.deleted_at.is_(None))):
        raise HTTPException(status_code=409, detail="A store with this name already exists.")
    row = Store(name=name, location=payload.location.strip() if payload.location else None)
    db.add(row)
    db.flush()
    write_audit(db, user, "create", "store", row.id, after={"name": row.name})
    db.commit()
    db.refresh(row)
    return {"id": row.id, "name": row.name, "location": row.location}


@router.get("/staff")
def list_staff(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    search: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*READ_ROLES)),
) -> dict:
    statement = select(Staff).where(Staff.deleted_at.is_(None))
    if search:
        statement = statement.where(Staff.name.ilike(f"%{search.strip()}%"))
    rows, total = _page(statement, Staff, db, offset, limit)
    return {
        "items": [{
            "id": row.id,
            "name": row.name,
            "email": row.email,
            "phone": row.phone,
            "technician_number": row.technician_number,
        } for row in rows],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.post("/staff", status_code=status.HTTP_201_CREATED)
def create_staff(
    payload: StaffCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("Admin", "Procurement Officer", "Store Keeper")),
) -> dict:
    row = Staff(
        name=payload.name.strip(),
        email=payload.email.strip().lower() if payload.email else None,
        phone=payload.phone.strip() if payload.phone else None,
        technician_number=payload.technician_number.strip() if payload.technician_number else None,
    )
    db.add(row)
    db.flush()
    write_audit(db, user, "create", "staff", row.id, after={"name": row.name})
    db.commit()
    db.refresh(row)
    return {"id": row.id, "name": row.name, "email": row.email, "phone": row.phone}


@router.get("/suppliers")
def list_suppliers(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    search: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*READ_ROLES)),
) -> dict:
    statement = select(Supplier).where(Supplier.deleted_at.is_(None))
    if search:
        statement = statement.where(Supplier.name.ilike(f"%{search.strip()}%"))
    rows, total = _page(statement, Supplier, db, offset, limit)
    return {
        "items": [{
            "id": row.id,
            "name": row.name,
            "contact_name": row.contact_name,
            "email": row.email,
            "phone": row.phone,
            "kra_pin": row.kra_pin,
            "payment_terms": row.payment_terms,
            "status": row.status,
            "vat_registered": row.vat_registered,
            "wht_applicable": row.wht_applicable,
            "wht_category": row.wht_category,
            "performance_score": str(row.performance_score) if row.performance_score is not None else None,
        } for row in rows],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.post("/suppliers", status_code=status.HTTP_201_CREATED)
def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE_ROLES)),
) -> dict:
    name = payload.name.strip()
    if db.scalar(select(Supplier.id).where(func.lower(Supplier.name) == name.lower(), Supplier.deleted_at.is_(None))):
        raise HTTPException(status_code=409, detail="A supplier with this name already exists.")
    row = Supplier(
        name=name,
        normalized_name=" ".join(name.casefold().split()),
        contact_name=payload.contact_name.strip() if payload.contact_name else None,
        email=payload.email.strip().lower() if payload.email else None,
        phone=payload.phone.strip() if payload.phone else None,
        kra_pin=payload.kra_pin.strip().upper() if payload.kra_pin else None,
        payment_terms=payload.payment_terms.strip() if payload.payment_terms else None,
        vat_registered=payload.vat_registered,
        wht_applicable=payload.wht_applicable,
        wht_category=payload.wht_category,
    )
    db.add(row)
    db.flush()
    write_audit(db, user, "create", "supplier", row.id, after={"name": row.name})
    db.commit()
    db.refresh(row)
    return {"id": row.id, "name": row.name, "phone": row.phone, "email": row.email}


@router.get("/items")
def list_items(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    search: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*READ_ROLES)),
) -> dict:
    statement = select(Item).where(Item.deleted_at.is_(None))
    if search:
        term = f"%{search.strip()}%"
        statement = statement.where(Item.name.ilike(term) | Item.description.ilike(term))
    rows, total = _page(statement, Item, db, offset, limit)
    items = []
    for row in rows:
        category = db.get(Category, row.category_id) if row.category_id else None
        unit = db.get(Unit, row.unit_id) if row.unit_id else None
        supplier = db.get(Supplier, row.preferred_supplier_id) if row.preferred_supplier_id else None
        items.append({
            "id": row.id,
            "sku": row.sku,
            "name": row.name,
            "description": row.description,
            "category_id": row.category_id,
            "category": category.name if category else None,
            "unit_id": row.unit_id,
            "unit": unit.code if unit else None,
            "reorder_level": str(row.reorder_level),
            "preferred_supplier_id": row.preferred_supplier_id,
            "preferred_supplier": supplier.name if supplier else None,
            "vat_treatment": row.vat_treatment,
        })
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("/items", status_code=status.HTTP_201_CREATED)
def create_item(
    payload: ItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE_ROLES)),
) -> dict:
    name = payload.name.strip()
    if payload.sku and db.scalar(select(Item.id).where(Item.sku == payload.sku.strip())):
        raise HTTPException(status_code=409, detail="An item with this SKU already exists.")
    for model, entity_id, label in (
        (Category, payload.category_id, "Category"),
        (Unit, payload.unit_id, "Unit"),
        (Supplier, payload.preferred_supplier_id, "Supplier"),
    ):
        if entity_id is not None:
            row = db.get(model, entity_id)
            if row is None or (hasattr(row, "deleted_at") and row.deleted_at is not None):
                raise HTTPException(status_code=422, detail=f"{label} {entity_id} does not exist or is inactive.")
    row = Item(
        sku=payload.sku.strip() if payload.sku else None,
        name=name,
        description=payload.description.strip() if payload.description else None,
        category_id=payload.category_id,
        unit_id=payload.unit_id,
        reorder_level=payload.reorder_level,
        preferred_supplier_id=payload.preferred_supplier_id,
        vat_treatment=payload.vat_treatment,
    )
    db.add(row)
    db.flush()
    write_audit(db, user, "create", "item", row.id, after={"name": row.name, "sku": row.sku})
    db.commit()
    db.refresh(row)
    return {"id": row.id, "sku": row.sku, "name": row.name}
