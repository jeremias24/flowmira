# ── NEW ── whole file
"""Sign-in through the IPC portal / UMS, and who may do what.

Flow: the portal opens /authenticate/<credentials>; the browser hands <credentials> to
POST /api/auth/login; this server (never the browser) asks UMS who it is, then reads that
user's SYS-222-FM access from ipc_centralized.sp_user_system_active_accesses and starts a
session cookie. The access is read again from the stored procedure every few minutes, so access
removed in UMS stops working without waiting for the cookie to expire.

UMS only says *who* someone is; *what* they may do always comes from the stored procedure (IPC_DB_*).

Same UMS calls as Athena (UmsClient / UmsAuthGuard), with these differences on purpose:
roles are matched by exact user type id (not by substring), UMS error text is logged but
never sent to the browser, and UMS isn't called on every request.
"""
import hashlib
import logging
import os
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import Depends, HTTPException, Request
from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.engine import URL
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .database import get_db
from .models import AuthSession

log = logging.getLogger("uvicorn.error")


def _ids(name: str, default: str) -> set[int]:
    return {int(v) for v in os.getenv(name, default).split(",") if v.strip()}


UMS_AUTH_URL = os.getenv("UMS_AUTH_URL", "").rstrip("/")  # e.g. http://host.docker.internal:8001/api/v1
UMS_TIMEOUT = float(os.getenv("UMS_TIMEOUT", "10"))
SYSTEM_CODE = os.getenv("FLOWMIRA_SYSTEM_CODE", "SYS-222-FM")
# ipc_centralized user types: 2 Super User, 3 System Owner, 5 Regular User, 13 Administrator.
OWNER_TYPE_IDS = _ids("FLOWMIRA_OWNER_TYPE_IDS", "2,3")
USER_TYPE_IDS = _ids("FLOWMIRA_USER_TYPE_IDS", "5,13")
# Used only when UMS sends a type name without its id.
TYPE_IDS_BY_NAME = {"Super User": 2, "System Owner": 3, "Regular User": 5, "Administrator": 13}
SESSION_HOURS = float(os.getenv("SESSION_HOURS", "8"))
RECHECK_MINUTES = float(os.getenv("ACCESS_RECHECK_MINUTES", "5"))
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "1") != "0"
COOKIE_NAME = "flowmira_session"

# Tests swap this for httpx.MockTransport.
TRANSPORT: httpx.BaseTransport | None = None

# What the portal puts in the link: btoa(encodeURIComponent(JSON)), i.e. base64, maybe %-escaped.
CREDENTIALS_RE = re.compile(r"^[A-Za-z0-9+/=%]{1,4096}$")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    """SQLite gives back naive datetimes; they were stored as UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class AccessDenied(Exception):
    """No: unknown user, bad link, or no accepted SYS-222-FM access."""


class AccessUnavailable(Exception):
    """UMS or ipc_centralized couldn't be reached or failed; says nothing about the user."""


@dataclass
class SignedInUser:
    user_id: str
    employee_id: int | None
    user_class_id: int
    username: str | None
    employee_no: str | None
    full_name: str
    email: str | None
    user_type_id: int | None
    user_type: str
    role: str  # "owner" | "user"


# ---------- ipc_centralized (read only) ----------

def _ipc_engine() -> Engine | None:
    """Connection to ipc_centralized for sp_user_system_active_accesses. Best: an account that can
    only EXECUTE that procedure. Sessions are read-only either way."""
    url = os.getenv("IPC_DB_URL")  # full URL alternative (tests use SQLite)
    if not url and os.getenv("IPC_DB_HOST"):
        url = URL.create(
            "mysql+pymysql",
            username=os.getenv("IPC_DB_USER"), password=os.getenv("IPC_DB_PASSWORD"),
            host=os.getenv("IPC_DB_HOST"), port=int(os.getenv("IPC_DB_PORT", "3306")),
            database=os.getenv("IPC_DB_NAME", "ipc_centralized"),
            query={"charset": "utf8mb4"},
        )
    if not url:
        return None
    is_mysql = str(url).startswith("mysql")
    engine = create_engine(url, pool_pre_ping=True, pool_recycle=1800,
                           connect_args={"connect_timeout": 5} if is_mysql else {})
    if is_mysql:
        @event.listens_for(engine, "connect")
        def _read_only(dbapi_connection, _record):  # belt and braces on top of a SELECT-only account
            with dbapi_connection.cursor() as cursor:
                cursor.execute("SET SESSION TRANSACTION READ ONLY")
    return engine


IPC_ENGINE: Engine | None = _ipc_engine()

# ── FIX ── parameter order matches IPCC UserSystemActiveAccessesSp.getWhere().
ACCESS_SQL = text(
    "CALL ipc_centralized.sp_user_system_active_accesses"
    "(:user_id, :employee_id, :user_class_id)"
)


def view_accesses(user_id: str, employee_id: int | None, user_class_id: int) -> list[dict[str, Any]]:
    """Call IPC's active-access procedure with the server-authenticated identity.

    Retain this helper's name for callers; it no longer selects from a view.
    IPCC casts a missing employee id to 0; mirror that convention.
    """
    if IPC_ENGINE is None:
        raise AccessUnavailable("IPC_DB_HOST is not set: can't call sp_user_system_active_accesses")
    try:
        with IPC_ENGINE.connect() as conn:
            result = conn.execute(ACCESS_SQL, {
                "user_id": int(user_id), "employee_id": employee_id or 0,
                "user_class_id": user_class_id,
            })
            try:
                rows = result.mappings().all()
            finally:
                result.close()
        return [{"userTypeId": r["user_type_id"], "userType": r["user_type"],
                 "systemReferenceCode": r["system_reference_code"]} for r in rows]
    except (SQLAlchemyError, ValueError, KeyError) as exc:
        raise AccessUnavailable("ipc_centralized access procedure failed") from exc


def identity_ids(payload: dict[str, Any]) -> tuple[str, int | None, int]:
    """Require identity fields from UMS; never guess a user's class or use employeeNo."""
    try:
        raw_user = payload["id"]
        raw_class = payload["userClassId"]
        raw_employee = payload["employeeId"]
        values = (raw_user, raw_class) + (() if raw_employee is None else (raw_employee,))
        if any(isinstance(v, bool) or not str(v).isdigit() or int(v) <= 0 for v in values):
            raise ValueError("invalid identity id")
        return str(int(raw_user)), None if raw_employee is None else int(raw_employee), int(raw_class)
    except (KeyError, TypeError, ValueError) as exc:
        raise AccessUnavailable("UMS user has missing or invalid identity fields") from exc


# ---------- roles ----------

def _type_id(access: dict[str, Any]) -> int | None:
    raw = access.get("userTypeId", access.get("user_type_id"))
    try:
        return int(raw)
    except (TypeError, ValueError):
        return TYPE_IDS_BY_NAME.get(str(access.get("userType", access.get("user_type", ""))))


def role_for(accesses: list[Any]) -> tuple[str, int | None, str]:
    """(role, user type id, user type name) from the SYS-222-FM access. Raises AccessDenied."""
    # UMS returns accesses to *any* system whose type Flowmira accepts, so filter here.
    mine = [a for a in accesses if isinstance(a, dict)
            and (a.get("systemReferenceCode") or a.get("system_reference_code")) == SYSTEM_CODE]
    if not mine:
        raise AccessDenied(f"no {SYSTEM_CODE} access")
    for role, allowed in (("owner", OWNER_TYPE_IDS), ("user", USER_TYPE_IDS)):
        for access in mine:
            type_id = _type_id(access)
            if type_id in allowed:
                return role, type_id, str(access.get("userType") or access.get("user_type") or "")
    raise AccessDenied(f"{SYSTEM_CODE} user type {[_type_id(a) for a in mine]} not allowed")


# ---------- UMS ----------

def _client() -> httpx.Client:
    if not UMS_AUTH_URL:
        raise AccessUnavailable("UMS_AUTH_URL is not set")
    return httpx.Client(base_url=UMS_AUTH_URL, timeout=UMS_TIMEOUT, transport=TRANSPORT,
                        headers={"Accept": "application/json"})


def _payload(response: httpx.Response) -> dict[str, Any]:
    # UMS refuses with 401 "No access" / 422 "credentials are not correct"; anything else
    # that isn't a 200 is UMS's own problem (e.g. 500 for an unknown token).
    if response.status_code in (401, 403, 404, 422):
        raise AccessDenied(f"UMS HTTP {response.status_code}: {response.text[:300]}")
    if response.status_code != 200:
        raise AccessUnavailable(f"UMS HTTP {response.status_code}: {response.text[:300]}")
    try:
        body = response.json()
    except ValueError as exc:
        raise AccessUnavailable("UMS did not return JSON") from exc
    raw = body.get("data", body) if isinstance(body, dict) else {}
    user = raw.get("user") if isinstance(raw, dict) else None
    if isinstance(user, dict) and isinstance(user.get("user"), dict):
        user = user["user"]
    if not isinstance(user, dict):
        raise AccessUnavailable("UMS response has no user")
    if not user.get("apiToken") and isinstance(raw, dict) and raw.get("apiToken"):
        user = {**user, "apiToken": raw["apiToken"]}
    return user


def ums_authenticate(credentials: str) -> dict[str, Any]:
    """GET <UMS>/authenticate/<credentials>: the portal hand-off. Who the user is."""
    try:
        with _client() as client:
            response = client.get(f"/authenticate/{quote(credentials, safe='')}")
    except httpx.HTTPError as exc:
        raise AccessUnavailable(f"UMS: {exc}") from exc
    return _payload(response)


def sign_in(credentials: str) -> SignedInUser:
    """Who: UMS. Which access: sp_user_system_active_accesses (never UMS's own access list)."""
    payload = ums_authenticate(credentials)
    user_id, employee_id, user_class_id = identity_ids(payload)
    role, type_id, type_name = role_for(view_accesses(user_id, employee_id, user_class_id))
    return SignedInUser(
        user_id=user_id, employee_id=employee_id, user_class_id=user_class_id,
        username=payload.get("username"),
        employee_no=str(payload["employeeNo"]) if payload.get("employeeNo") else None,
        full_name=str(payload.get("fullName") or payload.get("username") or user_id)[:200],
        email=payload.get("email"),
        user_type_id=type_id, user_type=type_name, role=role,
    )


# ---------- sessions ----------

def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(db: Session, user: SignedInUser) -> str:
    """Store a new session and return the cookie value."""
    now = utcnow()
    db.query(AuthSession).filter(AuthSession.expires_at < now).delete()  # tidy up old ones
    token = secrets.token_urlsafe(32)
    db.add(AuthSession(
        id=_hash(token), user_id=user.user_id, employee_id=user.employee_id,
        user_class_id=user.user_class_id, username=user.username, employee_no=user.employee_no,
        full_name=user.full_name, email=user.email, user_type_id=user.user_type_id,
        user_type=user.user_type, role=user.role, ums_token="",  # UMS token isn't needed or kept
        created_at=now, verified_at=now, expires_at=now + timedelta(hours=SESSION_HOURS),
    ))
    db.commit()
    return token


def end_session(db: Session, request: Request) -> None:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        db.query(AuthSession).filter(AuthSession.id == _hash(token)).delete()
        db.commit()


def _recheck(db: Session, session: AuthSession) -> AuthSession | None:
    """Read the access from the stored procedure again. None = it's gone. View unreachable = keep the session
    until it expires."""
    try:
        role, type_id, type_name = role_for(view_accesses(session.user_id, session.employee_id, session.user_class_id))
    except AccessDenied as exc:
        log.info("Flowmira access ended for UMS user %s: %s", session.user_id, exc)
        db.delete(session)
        db.commit()
        return None
    except AccessUnavailable as exc:
        log.warning("Access re-check skipped for user %s: %s", session.user_id, exc)
        return session
    session.user_type_id, session.user_type, session.role = type_id, type_name, role
    session.verified_at = utcnow()
    db.commit()
    return session


def current_user(request: Request, db: Session = Depends(get_db)) -> AuthSession:
    """Dependency: the signed-in user, or 401."""
    token = request.cookies.get(COOKIE_NAME)
    session = db.get(AuthSession, _hash(token)) if token else None
    if session is None:
        raise HTTPException(401, "Not signed in. Open Flowmira from the IPC portal.")
    # ── FIX ── old sessions lack the procedure identity: require a fresh portal sign-in.
    if session.user_class_id is None:
        db.delete(session)
        db.commit()
        raise HTTPException(401, "Open Flowmira from the IPC portal to sign in again.")
    now = utcnow()
    if _aware(session.expires_at) <= now:
        db.delete(session)
        db.commit()
        raise HTTPException(401, "Your session has ended. Open Flowmira from the IPC portal again.")
    if _aware(session.verified_at) <= now - timedelta(minutes=RECHECK_MINUTES):
        session = _recheck(db, session)
        if session is None:
            raise HTTPException(401, "Your Flowmira access has changed. Open Flowmira from the IPC portal again.")
    return session


def is_owner(user: AuthSession) -> bool:
    return user.role == "owner"


def require_owner(user: AuthSession = Depends(current_user)) -> AuthSession:
    """Dependency: System Owner / Super User only, or 403."""
    if not is_owner(user):
        raise HTTPException(403, "Only system owners can do this.")
    return user
