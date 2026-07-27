from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import CurrentUser, get_client_ip, get_current_user
from app.models.enums import VIEW_MODE_ROLES
from app.models.tenant import Tenant
from app.models.user import User, UserSession
from app.schemas.auth import LoginRequest, MeResponse
from app.security import (
    generate_session_token,
    hash_token,
    is_rate_limited,
    now_utc,
    record_login_attempt,
    session_expiry,
    verify_password,
)
from app.services.audit import record_event

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


@router.post("/login")
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = get_client_ip(request)
    username = payload.username.strip()

    if is_rate_limited(db, username, ip):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail={"message": "Too many failed attempts. Please try again later."})

    user = db.query(User).filter(User.username == username).first()
    generic_error = HTTPException(status.HTTP_401_UNAUTHORIZED, detail={"message": "Invalid username or password."})

    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        record_login_attempt(db, username, ip, succeeded=False)
        if user:
            record_event(
                db,
                tenant_id=user.tenant_id,
                user_id=user.id,
                username=user.username,
                role=user.role.value,
                action="LOGIN_FAILED",
                description=f"Failed login attempt for {username}" + (" (account inactive)" if user and not user.is_active else ""),
                ip_address=ip,
            )
        raise generic_error

    record_login_attempt(db, username, ip, succeeded=True)

    token = generate_session_token()
    session = UserSession(
        user_id=user.id,
        token_hash=hash_token(token),
        tenant_id=user.tenant_id,
        role=user.role,
        ip_address=ip,
        user_agent=request.headers.get("user-agent"),
        created_at=now_utc(),
        last_seen_at=now_utc(),
        expires_at=session_expiry(),
    )
    db.add(session)
    db.commit()

    record_event(
        db,
        tenant_id=user.tenant_id,
        user_id=user.id,
        username=user.username,
        role=user.role.value,
        action="LOGIN",
        description=f"{user.name} signed in ({user.role.value})",
        ip_address=ip,
    )

    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=settings.session_ttl_minutes * 60,
        path="/",
    )
    return {"ok": True, "role": user.role.value}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        session = db.query(UserSession).filter(UserSession.token_hash == hash_token(token)).first()
        if session:
            session.revoked_at = now_utc()
            user = db.query(User).filter(User.id == session.user_id).first()
            if user:
                record_event(
                    db,
                    tenant_id=user.tenant_id,
                    user_id=user.id,
                    username=user.username,
                    role=user.role.value,
                    action="LOGOUT",
                    description=f"{user.name} signed out",
                )
            db.commit()
    response.delete_cookie(settings.session_cookie_name, path="/")
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
def me(current_user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first() if current_user.tenant_id else None
    return MeResponse(
        id=current_user.id,
        username=current_user.username,
        name=current_user.name,
        role=current_user.role,
        tenant_id=current_user.tenant_id,
        tenant_name=tenant.name if tenant else None,
        tenant_code=tenant.code if tenant else None,
        view_mode=current_user.role in VIEW_MODE_ROLES,
        can_mark_paid=current_user.can_mark_paid,
    )
