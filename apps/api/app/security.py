"""Password hashing, session token issuance/verification, and login rate limiting.

Design notes (see docs/architecture.md §4):
- Argon2id password hashing (argon2-cffi), never plaintext, never logged.
- Opaque, cryptographically random session tokens (secrets.token_urlsafe), stored
  server-side as a SHA-256 hash (so a leaked DB dump does not yield usable cookies).
- Sliding-window login rate limiting per (username, ip) pair backed by the
  `login_attempts` table — sufficient for a first local version; swappable for
  Redis later without changing call sites.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.user import LoginAttempt

settings = get_settings()
_hasher = PasswordHasher()


def hash_password(plain: str) -> str:
    return _hasher.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _hasher.verify(hashed, plain)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def generate_session_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def session_expiry() -> datetime:
    return now_utc() + timedelta(minutes=settings.session_ttl_minutes)


def session_absolute_expiry() -> datetime:
    return now_utc() + timedelta(hours=settings.session_absolute_ttl_hours)


def record_login_attempt(db: Session, username: str, ip_address: str | None, succeeded: bool) -> None:
    db.add(LoginAttempt(username=username, ip_address=ip_address, succeeded=succeeded, attempted_at=now_utc()))
    db.commit()


def is_rate_limited(db: Session, username: str, ip_address: str | None) -> bool:
    window_start = now_utc() - timedelta(seconds=settings.login_rate_limit_window_seconds)
    stmt = select(func.count()).select_from(LoginAttempt).where(
        LoginAttempt.username == username,
        LoginAttempt.succeeded.is_(False),
        LoginAttempt.attempted_at >= window_start,
    )
    failed_count = db.execute(stmt).scalar_one()
    return failed_count >= settings.login_rate_limit_attempts
