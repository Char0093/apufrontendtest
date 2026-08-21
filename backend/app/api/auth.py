import json
import time
import urllib.parse
import urllib.request

import jwt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.auth import create_app_token, get_current_employee
from app.database.session import get_db
from app.models.employee import Employee

router = APIRouter(prefix="/auth", tags=["auth"])

CLAIM_TOKEN_PURPOSE = "google_identity_claim"
CLAIM_TOKEN_EXP_SECONDS = 600


class GoogleLoginRequest(BaseModel):
    credential: str


class ClaimIdentityRequest(BaseModel):
    claim_token: str
    employee_id: str | None = None


class AuthUser(BaseModel):
    id: str
    name: str
    email: str
    title: str | None = None
    is_management: bool = False


class AuthResponse(BaseModel):
    status: str = "ok"
    access_token: str
    token_type: str = "bearer"
    expires_at: int
    user: AuthUser


class EmployeeOption(BaseModel):
    id: str
    name: str
    title: str | None = None


class NeedsSelectionResponse(BaseModel):
    status: str = "needs_selection"
    claim_token: str
    google_name: str
    options: list[EmployeeOption]


def _employee_to_user(employee: Employee) -> AuthUser:
    return AuthUser(
        id=employee.id,
        name=employee.name,
        email=employee.email,
        title=employee.title,
        is_management=employee.is_management,
    )


def _verify_google_id_token(id_token: str) -> dict:
    settings = get_settings()
    if not settings.google_oauth_client_id:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured")

    query = urllib.parse.urlencode({"id_token": id_token})
    req = urllib.request.Request(f"https://oauth2.googleapis.com/tokeninfo?{query}")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=401, detail="Could not verify Google credential")

    if payload.get("aud") != settings.google_oauth_client_id:
        raise HTTPException(status_code=401, detail="Google credential audience mismatch")
    if payload.get("email_verified") not in {"true", True}:
        raise HTTPException(status_code=401, detail="Google email is not verified")
    if not payload.get("email"):
        raise HTTPException(status_code=401, detail="Google credential has no email")
    return payload


def _find_by_email_or_name(db: Session, email: str, name: str) -> Employee | None:
    employee = db.query(Employee).filter(func.lower(Employee.email) == email.lower()).first()
    if employee is not None:
        return employee

    # Demo-friendly mapping: if a seeded employee's name matches the Google
    # display name, attach that existing identity instead of creating a
    # duplicate person in the graph/access-control model.
    by_name = db.query(Employee).filter(func.lower(Employee.name) == name.lower()).first()
    if by_name is not None:
        by_name.email = email
        db.commit()
        db.refresh(by_name)
        return by_name
    return None


def _create_new_employee(db: Session, email: str, name: str) -> Employee:
    employee = Employee(name=name, email=email, title="Google OAuth User", is_management=False)
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


def _seeded_employee_options(db: Session) -> list[Employee]:
    # Excludes accounts this same flow already auto-created for some earlier
    # unmatched login — those aren't a real identity to hand to someone
    # else, they'd just clutter the picker with prior strangers.
    return (
        db.query(Employee)
        .filter(func.coalesce(Employee.title, "") != "Google OAuth User")
        .order_by(Employee.name)
        .all()
    )


def _create_claim_token(email: str, name: str) -> str:
    settings = get_settings()
    now = int(time.time())
    payload = {
        "iss": settings.app_jwt_issuer,
        "purpose": CLAIM_TOKEN_PURPOSE,
        "email": email,
        "name": name,
        "iat": now,
        "exp": now + CLAIM_TOKEN_EXP_SECONDS,
    }
    return jwt.encode(payload, settings.app_jwt_secret, algorithm="HS256")


def _decode_claim_token(token: str) -> dict:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.app_jwt_secret,
            algorithms=["HS256"],
            issuer=settings.app_jwt_issuer,
        )
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired claim token")
    if payload.get("purpose") != CLAIM_TOKEN_PURPOSE:
        raise HTTPException(status_code=401, detail="Invalid claim token")
    return payload


@router.post("/google")
def google_login(payload: GoogleLoginRequest, db: Session = Depends(get_db)) -> AuthResponse | NeedsSelectionResponse:
    claims = _verify_google_id_token(payload.credential)
    email = str(claims["email"]).strip()
    name = str(claims.get("name") or email.split("@")[0]).strip()

    employee = _find_by_email_or_name(db, email=email, name=name)
    if employee is not None:
        access_token, expires_at = create_app_token(employee)
        return AuthResponse(access_token=access_token, expires_at=expires_at, user=_employee_to_user(employee))

    options = _seeded_employee_options(db)
    if not options:
        employee = _create_new_employee(db, email=email, name=name)
        access_token, expires_at = create_app_token(employee)
        return AuthResponse(access_token=access_token, expires_at=expires_at, user=_employee_to_user(employee))

    return NeedsSelectionResponse(
        claim_token=_create_claim_token(email, name),
        google_name=name,
        options=[EmployeeOption(id=e.id, name=e.name, title=e.title) for e in options],
    )


@router.post("/google/claim", response_model=AuthResponse)
def claim_identity(payload: ClaimIdentityRequest, db: Session = Depends(get_db)) -> AuthResponse:
    claims = _decode_claim_token(payload.claim_token)
    email = claims["email"]
    name = claims["name"]

    if payload.employee_id:
        employee = db.query(Employee).filter(Employee.id == payload.employee_id).first()
        if employee is None:
            raise HTTPException(status_code=404, detail="Selected employee no longer exists")
        employee.email = email
        db.commit()
        db.refresh(employee)
    else:
        employee = _create_new_employee(db, email=email, name=name)

    access_token, expires_at = create_app_token(employee)
    return AuthResponse(access_token=access_token, expires_at=expires_at, user=_employee_to_user(employee))


@router.get("/me", response_model=AuthUser)
def me(employee: Employee = Depends(get_current_employee)) -> AuthUser:
    return _employee_to_user(employee)
