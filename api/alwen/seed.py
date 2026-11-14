from sqlalchemy import select
from sqlalchemy.orm import Session

from alwen.database import SessionLocal
from alwen.models import Category, PaymentMethod, Project, Store, Unit


DEFAULT_CATEGORIES = (
    "2km Drop Cable",
    "Indoor/Gigalan Cable",
    "ADSS Cables (8 core)",
    "ADSS Cables (12 core)",
    "ADSS Cables (24 core)",
    "ADSS Cables (48 core)",
    "Accessories",
    "Equipment",
    "Tools",
    "PPEs",
    "Fleet Tools",
    "Safety",
)

DEFAULT_UNITS = {
    "pcs": "Pieces",
    "roll": "Roll",
    "reel": "Reel",
    "pair": "Pair",
    "pkt": "Packet",
    "m": "Metre",
}

DEFAULT_PAYMENT_METHODS = (
    "PD Cheque",
    "Current Cheque",
    "Petty Cash",
    "Bank Transfer",
)

DEFAULT_PROJECTS = {
    "KER": "Kericho",
    "LIT": "Litein",
    "KAP": "Kapkatet",
    "CRH": "Crescent Hotel",
    "IMP": "Import Project",
    "CON": "Construction/Maintenance",
    "CLI": "Client Installation",
    "HQ": "HQ/Office",
}


def seed_reference_data(session: Session) -> None:
    for name in DEFAULT_CATEGORIES:
        if session.scalar(select(Category.id).where(Category.name == name)) is None:
            session.add(Category(name=name))

    for code, display_name in DEFAULT_UNITS.items():
        if session.scalar(select(Unit.id).where(Unit.code == code)) is None:
            session.add(Unit(code=code, display_name=display_name))

    for name in DEFAULT_PAYMENT_METHODS:
        if session.scalar(select(PaymentMethod.id).where(PaymentMethod.name == name)) is None:
            session.add(PaymentMethod(name=name))

    for code, name in DEFAULT_PROJECTS.items():
        if session.scalar(select(Project.id).where(Project.code == code)) is None:
            session.add(Project(code=code, name=name))

    if session.scalar(select(Store.id).where(Store.name == "Main Store")) is None:
        session.add(Store(name="Main Store"))

    session.commit()


if __name__ == "__main__":
    with SessionLocal() as db:
        seed_reference_data(db)
    print("Reference data seeded.")
