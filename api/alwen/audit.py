from sqlalchemy.orm import Session

from alwen.models import AuditLog, User


def write_audit(
    db: Session,
    user: User,
    action: str,
    entity_type: str,
    entity_id: int,
    before: dict | None = None,
    after: dict | None = None,
) -> None:
    db.add(AuditLog(
        user_id=user.id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        before_data=before,
        after_data=after,
    ))
