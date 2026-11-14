import logging
import os
import smtplib
import urllib.parse
import urllib.request
from email.message import EmailMessage
from typing import Protocol

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, aliased

from alwen.auth import get_current_user
from alwen.database import get_db
from alwen.models import ApprovalDelegation, Notification, NotificationPreference, User, utc_now
from alwen.schemas import NotificationPreferenceInput


router = APIRouter(prefix="/notifications", tags=["notifications"])
logger = logging.getLogger(__name__)


class SmsProvider(Protocol):
    def send(self, phone_number: str, message: str) -> None: ...


class AfricasTalkingSmsProvider:
    def __init__(self, username: str, api_key: str) -> None:
        self.username = username
        self.api_key = api_key

    def send(self, phone_number: str, message: str) -> None:
        payload = urllib.parse.urlencode({
            "username": self.username,
            "to": phone_number,
            "message": message,
        }).encode()
        request = urllib.request.Request(
            "https://api.africastalking.com/version1/messaging",
            data=payload,
            headers={
                "apiKey": self.api_key,
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=15) as response:
            if response.status >= 300:
                raise RuntimeError(f"SMS provider returned HTTP {response.status}.")


def _send_email(recipient: str, subject: str, body: str) -> None:
    host = os.getenv("ALWEN_SMTP_HOST")
    if not host:
        logger.warning("Email notification for %s was not sent: ALWEN_SMTP_HOST is not configured.", recipient)
        return
    message = EmailMessage()
    message["From"] = os.getenv("ALWEN_SMTP_FROM", os.getenv("ALWEN_SMTP_USER", ""))
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)
    port = int(os.getenv("ALWEN_SMTP_PORT", "587"))
    with smtplib.SMTP(host, port, timeout=20) as server:
        server.starttls()
        username = os.getenv("ALWEN_SMTP_USER")
        password = os.getenv("ALWEN_SMTP_PASSWORD")
        if username:
            server.login(username, password or "")
        server.send_message(message)


def _send_sms(user: User, body: str) -> None:
    if os.getenv("ALWEN_SMS_ENABLED", "").lower() not in ("1", "true", "yes"):
        return
    username = os.getenv("AFRICASTALKING_USERNAME")
    api_key = os.getenv("AFRICASTALKING_API_KEY")
    if not username or not api_key or not user.phone:
        logger.warning("SMS notification for user %s was not sent: provider or phone is not configured.", user.id)
        return
    provider: SmsProvider = AfricasTalkingSmsProvider(username, api_key)
    provider.send(user.phone, body)


def notify_users(
    db: Session,
    users: list[User],
    *,
    kind: str,
    title: str,
    message: str,
) -> None:
    notifications = []
    delivery = []
    for user in users:
        preference = db.scalar(
            select(NotificationPreference).where(NotificationPreference.user_id == user.id)
        )
        allowed_kinds = preference.alert_kinds if preference else []
        if allowed_kinds and kind not in allowed_kinds:
            continue
        notifications.append(Notification(
            user_id=user.id,
            kind=kind,
            title=title,
            message=message,
        ))
        email_enabled = preference.email_enabled if preference else user.email_notifications
        sms_enabled = preference.sms_enabled if preference else False
        delivery.append((user, email_enabled, sms_enabled))
    if not notifications:
        return
    db.add_all(notifications)
    db.commit()
    for user, email_enabled, sms_enabled in delivery:
        try:
            if email_enabled:
                _send_email(user.email, title, message)
            if sms_enabled:
                _send_sms(user, message)
        except (OSError, RuntimeError, smtplib.SMTPException):
            logger.exception("Notification delivery failed for user %s.", user.id)


def notify_role(
    db: Session,
    role: str,
    *,
    kind: str,
    title: str,
    message: str,
) -> None:
    users = db.scalars(select(User).where(
        User.role == role,
        User.is_active.is_(True),
        User.deleted_at.is_(None),
    )).all()
    now = utc_now()
    delegate_user = aliased(User)
    delegator_user = aliased(User)
    delegates = db.scalars(
        select(delegate_user)
        .join(ApprovalDelegation, ApprovalDelegation.delegate_user_id == delegate_user.id)
        .join(delegator_user, delegator_user.id == ApprovalDelegation.delegator_user_id)
        .where(
            ApprovalDelegation.is_active.is_(True),
            ApprovalDelegation.starts_at <= now,
            ApprovalDelegation.ends_at >= now,
            delegator_user.role == role,
            delegate_user.is_active.is_(True),
            delegate_user.deleted_at.is_(None),
        )
    ).all()
    by_id = {user.id: user for user in [*users, *delegates]}
    notify_users(db, list(by_id.values()), kind=kind, title=title, message=message)


def notify_requester(
    db: Session,
    request_id: int,
    requester_id: int | None,
    *,
    kind: str,
    title: str,
    message: str,
) -> None:
    if requester_id is None:
        return
    user = db.get(User, requester_id)
    if user is not None and user.is_active and user.deleted_at is None:
        notify_users(db, [user], kind=kind, title=title, message=message)


@router.get("/me")
def inbox(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    unread_only: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    statement = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        statement = statement.where(Notification.read_at.is_(None))
    rows = db.scalars(statement.order_by(Notification.created_at.desc(), Notification.id.desc()).offset(offset).limit(limit)).all()
    return {"items": [{
        "id": row.id,
        "kind": row.kind,
        "title": row.title,
        "message": row.message,
        "read_at": row.read_at.isoformat() if row.read_at else None,
        "created_at": row.created_at.isoformat(),
    } for row in rows]}


@router.patch("/{notification_id}/read")
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    notification = db.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notification not found.")
    if notification.read_at is None:
        notification.read_at = utc_now()
        db.commit()
    return {"id": notification.id, "read_at": notification.read_at.isoformat()}


@router.get("/preferences/me")
def get_preferences(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    preference = db.scalar(
        select(NotificationPreference).where(NotificationPreference.user_id == user.id)
    )
    if preference is None:
        return {"email_enabled": user.email_notifications, "sms_enabled": False, "alert_kinds": []}
    return {
        "email_enabled": preference.email_enabled,
        "sms_enabled": preference.sms_enabled,
        "alert_kinds": preference.alert_kinds,
    }


@router.put("/preferences/me")
def set_preferences(
    payload: NotificationPreferenceInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    preference = db.scalar(
        select(NotificationPreference).where(NotificationPreference.user_id == user.id)
    )
    if preference is None:
        preference = NotificationPreference(
            user_id=user.id,
            email_enabled=payload.email_enabled,
            sms_enabled=payload.sms_enabled,
            alert_kinds=payload.alert_kinds,
        )
        db.add(preference)
    else:
        preference.email_enabled = payload.email_enabled
        preference.sms_enabled = payload.sms_enabled
        preference.alert_kinds = payload.alert_kinds
    db.commit()
    return {
        "email_enabled": preference.email_enabled,
        "sms_enabled": preference.sms_enabled,
        "alert_kinds": preference.alert_kinds,
    }
