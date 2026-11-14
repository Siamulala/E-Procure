import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from math import ceil
from threading import Lock
from time import monotonic

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from alwen.database import get_db
from alwen.models import ApiSession, User, utc_now


router = APIRouter(prefix="/auth", tags=["authentication"])
bearer_scheme = HTTPBearer(auto_error=False)
PASSWORD_ITERATIONS = 310_000
SESSION_HOURS = 8
LOGIN_LIMIT = 10
LOGIN_WINDOW_SECONDS = 15 * 60
_failed_login_attempts: dict[str, tuple[float, int]] = {}
_login_attempt_lock = Lock()


def _login_bucket(client_host: str, now: float) -> tuple[float, int]:
    with _login_attempt_lock:
        bucket = _failed_login_attempts.get(client_host)
        if bucket is None or now - bucket[0] >= LOGIN_WINDOW_SECONDS:
            _failed_login_attempts[client_host] = (now, 0)
            return now, 0
        return bucket


def _check_login_limit(client_host: str) -> None:
    now = monotonic()
    window_start, attempts = _login_bucket(client_host, now)
    if attempts >= LOGIN_LIMIT:
        retry_after = max(1, ceil(LOGIN_WINDOW_SECONDS - (now - window_start)))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed sign-in attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )


def _record_failed_login(client_host: str) -> None:
    now = monotonic()
    with _login_attempt_lock:
        expired = [
            host for host, (window_start, _) in _failed_login_attempts.items()
            if now - window_start >= LOGIN_WINDOW_SECONDS
        ]
        for host in expired:
            del _failed_login_attempts[host]
        window_start, attempts = _failed_login_attempts.get(client_host, (now, 0))
        _failed_login_attempts[client_host] = (window_start, attempts + 1)


def _clear_failed_logins(client_host: str) -> None:
    with _login_attempt_lock:
        _failed_login_attempts.pop(client_host, None)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=256)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized.count("@") != 1 or "." not in normalized.rsplit("@", 1)[1]:
            raise ValueError("Enter a valid email address.")
        return normalized


class PasswordResetComplete(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    new_password: str = Field(min_length=8, max_length=256)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized.count("@") != 1 or "." not in normalized.rsplit("@", 1)[1]:
            raise ValueError("Enter a valid email address.")
        return normalized


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    role: str
    project_id: int | None


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${salt.hex()}${derived.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations, salt_hex, digest_hex = password_hash.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        derived = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(derived.hex(), digest_hex)


def _token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized

    api_session = db.scalar(
        select(ApiSession).where(ApiSession.token_hash == _token_digest(credentials.credentials))
    )
    now = utc_now()
    if api_session is None or api_session.revoked_at is not None:
        raise unauthorized
    expiry = api_session.expires_at
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    if expiry <= now:
        raise unauthorized

    user = db.get(User, api_session.user_id)
    if user is None or not user.is_active or user.deleted_at is not None:
        raise unauthorized
    return user


def require_roles(*roles: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions.")
        return user

    return dependency


@router.post("/login")
def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    client_host = request.client.host if request.client else "unknown"
    _check_login_limit(client_host)
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not user.is_active or user.deleted_at is not None:
        _record_failed_login(client_host)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    if not verify_password(payload.password, user.password_hash):
        _record_failed_login(client_host)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    _clear_failed_logins(client_host)
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)
    db.add(ApiSession(user_id=user.id, token_hash=_token_digest(token), expires_at=expires_at))
    db.commit()
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_at": expires_at.isoformat(),
        "user": UserResponse.model_validate(user).model_dump(),
    }


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    api_session = db.scalar(
        select(ApiSession).where(ApiSession.token_hash == _token_digest(credentials.credentials))
    )
    if api_session is None or api_session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session.")
    api_session.revoked_at = utc_now()
    db.commit()


@router.get("/me", response_model=UserResponse)
def current_user(user: User = Depends(get_current_user)) -> User:
    return user


@router.post("/password-reset/complete", status_code=status.HTTP_204_NO_CONTENT)
def complete_password_reset(
    payload: PasswordResetComplete,
    reset_key: str | None = Header(default=None, alias="X-Alwen-Password-Reset-Key"),
    db: Session = Depends(get_db),
) -> Response:
    configured_key = os.getenv("ALWEN_PASSWORD_RESET_KEY", "")
    if not configured_key:
        raise HTTPException(status_code=503, detail="API password reset is not configured.")
    if reset_key is None or not hmac.compare_digest(reset_key, configured_key):
        raise HTTPException(status_code=403, detail="Invalid password-reset service credentials.")

    user = db.scalar(select(User).where(func.lower(User.email) == payload.email))
    if user is not None:
        user.password_hash = hash_password(payload.new_password)
        db.execute(
            update(ApiSession)
            .where(ApiSession.user_id == user.id, ApiSession.revoked_at.is_(None))
            .values(revoked_at=utc_now())
        )
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
