# ── NEW ── whole file
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from .. import auth
from ..database import get_db
from ..models import AuthSession
from ..schemas import LoginRequest, Me

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _me(user: AuthSession) -> Me:
    return Me(id=user.user_id, full_name=user.full_name, email=user.email,
              user_type=user.user_type, role=user.role)


@router.post("/login", response_model=Me)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """Exchange the portal's sign-in link for a Flowmira session cookie."""
    if not auth.CREDENTIALS_RE.match(payload.credentials):
        raise HTTPException(400, "This sign-in link isn't valid. Open Flowmira from the IPC portal again.")
    try:
        user = auth.sign_in(payload.credentials)
    except auth.AccessDenied as exc:
        auth.log.info("Flowmira sign-in refused: %s", exc)
        raise HTTPException(403, "Your account has no access to Flowmira. "
                                 "Ask a Flowmira system owner to give you access in UMS.")
    except auth.AccessUnavailable as exc:
        auth.log.error("Flowmira sign-in failed: %s", exc)
        raise HTTPException(503, "Can't reach the IPC sign-in service right now. Try again in a minute.")
    token = auth.start_session(db, user)
    response.set_cookie(auth.COOKIE_NAME, token, max_age=int(auth.SESSION_HOURS * 3600),
                        httponly=True, secure=auth.COOKIE_SECURE, samesite="lax", path="/")
    return Me(id=user.user_id, full_name=user.full_name, email=user.email,
              user_type=user.user_type, role=user.role)


@router.get("/me", response_model=Me)
def me(user: AuthSession = Depends(auth.current_user)):
    return _me(user)


@router.post("/logout", status_code=204)
def logout(request: Request, db: Session = Depends(get_db)):
    auth.end_session(db, request)
    response = Response(status_code=204)
    response.delete_cookie(auth.COOKIE_NAME, path="/", httponly=True,
                           secure=auth.COOKIE_SECURE, samesite="lax")
    return response


@router.get("/check", status_code=204)
def check(role: str = Query("user", pattern="^(user|owner)$"),
          user: AuthSession = Depends(auth.current_user)):
    """For nginx auth_request: 204 = allowed, 401 = not signed in, 403 = not allowed."""
    if role == "owner" and not auth.is_owner(user):
        raise HTTPException(403, "Only system owners can do this.")
    return Response(status_code=204)
