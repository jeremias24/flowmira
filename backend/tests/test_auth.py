# ── NEW ── whole file
"""Sign-in, roles and diagram ownership, against a fake UMS (who) and a stand-in for
ipc_centralized.user_system_active_accesses_vw (what access).

Run:  cd backend && pip install -r requirements.txt pytest && pytest -q
"""
import base64
import json
import os
import tempfile
from datetime import timedelta
from urllib.parse import quote, unquote

_dir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_dir}/test_auth.db"
os.environ["IPC_DB_URL"] = f"sqlite:///{_dir}/ipc.db"
os.environ["UMS_AUTH_URL"] = "http://ums.test/api/v1"
os.environ["COOKIE_SECURE"] = "0"  # TestClient talks plain http

import httpx  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, inspect, text  # noqa: E402

from app import auth  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.main import add_owner_columns, app  # noqa: E402
from app.models import AuthSession, Diagram  # noqa: E402

FM = "SYS-222-FM"

# ---------- the view: user_id -> active accesses ----------

with auth.IPC_ENGINE.begin() as _c:
    _c.execute(text("CREATE TABLE user_system_active_accesses_vw (user_id INTEGER, user_type_id INTEGER, "
                    "user_type VARCHAR(60), system_reference_code VARCHAR(50))"))


def grant(user_id: int, type_id: int | None, type_name: str = "", code: str = FM) -> None:
    """Set the user's only access row in the view (None = no active access)."""
    with auth.IPC_ENGINE.begin() as conn:
        conn.execute(text("DELETE FROM user_system_active_accesses_vw WHERE user_id = :u"), {"u": user_id})
        if type_id is not None:
            conn.execute(text("INSERT INTO user_system_active_accesses_vw VALUES (:u, :t, :n, :c)"),
                         {"u": user_id, "t": type_id, "n": type_name, "c": code})


# username -> UMS users.id; the access each one has in the view
USERS = {"owner": 1, "super": 2, "regular": 3, "regular2": 4, "admin": 5,
         "atlas_owner": 6, "readonly": 7, "no_access": 8}
grant(1, 3, "System Owner")
grant(2, 2, "Super User")
grant(3, 5, "Regular User")
grant(4, 5, "Regular User")
grant(5, 13, "Administrator")
grant(6, 3, "System Owner", "SYS-005-ATLAS")  # owner of another system only
grant(7, 4, "Read-only User")                 # a type Flowmira doesn't accept
# 8: no row (no access, or inactive: the view drops those)

# ---------- fake UMS: identity only ----------

STATE = {"down": False}
CALLS: list[str] = []


def fake_ums(request: httpx.Request) -> httpx.Response:
    CALLS.append(request.url.path)
    if STATE["down"]:
        raise httpx.ConnectError("UMS down", request=request)
    if not request.url.path.startswith("/api/v1/authenticate/"):
        return httpx.Response(404)
    raw = request.url.raw_path.decode().split("?", 1)[0].rsplit("/", 1)[1]  # base64 may hold %2F
    try:
        creds = json.loads(unquote(base64.b64decode(unquote(raw)).decode()))
    except ValueError:
        return httpx.Response(500, text="Server Error")
    username = creds.get("username")
    if username not in USERS:
        return httpx.Response(422, json={"errors": "The Provided credentials are not correct"})
    uid = USERS[username]
    # UMS's own access list is deliberately wrong here: Flowmira must ignore it and use the view.
    return httpx.Response(200, json={"user": {
        "id": uid, "username": username, "employeeNo": f"E{uid}", "fullName": f"{username.title()} User",
        "email": f"{username}@example.test", "apiToken": f"{uid}|tok-{username}",
        "accesses": [{"userTypeId": 3, "userType": "System Owner", "systemReferenceCode": FM}]}})


auth.TRANSPORT = httpx.MockTransport(fake_ums)


def link(username: str, system: str = FM) -> str:
    """What the portal puts in /authenticate/<here>: btoa(encodeURIComponent(JSON))."""
    payload = json.dumps({"userId": 1, "username": username, "systemReferenceCode": system})
    return base64.b64encode(quote(payload, safe="").encode()).decode()


@pytest.fixture(scope="module")
def started():
    with TestClient(app):
        yield


def sign_in(username: str) -> TestClient:
    client = TestClient(app)
    r = client.post("/api/auth/login", json={"credentials": link(username)})
    assert r.status_code == 200, r.text
    return client


def new_diagram(client: TestClient, title: str = "D") -> int:
    r = client.post("/api/diagrams", json={"title": title, "template_key": "sipoc"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _age(client: TestClient, minutes: float = 60) -> None:
    with SessionLocal() as db:
        s = db.get(AuthSession, auth._hash(client.cookies[auth.COOKIE_NAME]))
        s.verified_at = auth.utcnow() - timedelta(minutes=minutes)
        db.commit()


# ---------- not signed in ----------

def test_everything_needs_sign_in_except_health(started):
    c = TestClient(app)
    assert c.get("/api/health").status_code == 200
    for method, path in [("get", "/api/diagrams"), ("post", "/api/diagrams"), ("get", "/api/diagrams/1"),
                         ("put", "/api/diagrams/1"), ("delete", "/api/diagrams/1"),
                         ("get", "/api/templates"), ("get", "/api/templates/sipoc"),
                         ("get", "/api/auth/me"), ("get", "/api/auth/check"),
                         ("get", "/api/auth/check?role=owner")]:
        assert getattr(c, method)(path).status_code == 401, (method, path)


def test_forged_cookie_is_rejected(started):
    c = TestClient(app, cookies={auth.COOKIE_NAME: "made-up"})
    assert c.get("/api/diagrams").status_code == 401


# ---------- signing in ----------

@pytest.mark.parametrize("username,role,user_type", [
    ("owner", "owner", "System Owner"), ("super", "owner", "Super User"),
    ("regular", "user", "Regular User"), ("admin", "user", "Administrator"),
])
def test_roles_come_from_the_view(started, username, role, user_type):
    # UMS claims System Owner for everyone; only the view counts.
    c = sign_in(username)
    me = c.get("/api/auth/me").json()
    assert (me["role"], me["user_type"]) == (role, user_type)
    assert c.get("/api/auth/check").status_code == 204
    assert c.get("/api/auth/check?role=owner").status_code == (204 if role == "owner" else 403)


@pytest.mark.parametrize("username", ["atlas_owner", "readonly", "no_access", "nobody"])
def test_refused(started, username):
    r = TestClient(app).post("/api/auth/login", json={"credentials": link(username)})
    assert r.status_code == 403
    assert "set-cookie" not in r.headers
    assert "credentials are not correct" not in r.text  # UMS's own text isn't passed on


def test_cookie_flags(started):
    r = TestClient(app).post("/api/auth/login", json={"credentials": link("regular")})
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "path=/" in cookie
    assert "tok-" not in r.text and "tok-" not in cookie  # the UMS token never reaches the browser
    auth.COOKIE_SECURE = True
    try:
        r = TestClient(app).post("/api/auth/login", json={"credentials": link("regular")})
        assert "secure" in r.headers["set-cookie"].lower()
    finally:
        auth.COOKIE_SECURE = False


def test_only_the_session_hash_is_stored_and_no_ums_token(started):
    c = sign_in("regular")
    token = c.cookies[auth.COOKIE_NAME]
    with SessionLocal() as db:
        assert db.get(AuthSession, token) is None
        assert db.get(AuthSession, auth._hash(token)).ums_token == ""


def test_bad_link_never_reaches_ums(started):
    CALLS.clear()
    for bad in ["../verify_api_token", "a b", "x?y=1", "a#b"]:
        assert TestClient(app).post("/api/auth/login", json={"credentials": bad}).status_code == 400
    assert CALLS == []


def test_garbage_link_is_a_ums_problem_not_a_crash(started):
    assert TestClient(app).post("/api/auth/login", json={"credentials": "bm90LWpzb24"}).status_code == 503


def test_ums_down(started):
    STATE["down"] = True
    try:
        assert TestClient(app).post("/api/auth/login", json={"credentials": link("owner")}).status_code == 503
    finally:
        STATE["down"] = False


def test_view_down(started, monkeypatch):
    c = sign_in("regular")
    monkeypatch.setattr(auth, "IPC_ENGINE", create_engine("sqlite:////nonexistent/dir/x.db"))
    _age(c)
    assert c.get("/api/auth/me").status_code == 200  # kept until the session expires
    assert TestClient(app).post("/api/auth/login", json={"credentials": link("regular")}).status_code == 503


def test_view_not_configured(started, monkeypatch):
    monkeypatch.setattr(auth, "IPC_ENGINE", None)
    assert TestClient(app).post("/api/auth/login", json={"credentials": link("owner")}).status_code == 503


def test_logout(started):
    c = sign_in("regular")
    token = c.cookies[auth.COOKIE_NAME]
    assert c.post("/api/auth/logout").status_code == 204
    assert TestClient(app, cookies={auth.COOKIE_NAME: token}).get("/api/auth/me").status_code == 401


def test_expired_session(started):
    c = sign_in("regular")
    with SessionLocal() as db:
        s = db.get(AuthSession, auth._hash(c.cookies[auth.COOKIE_NAME]))
        s.expires_at = auth.utcnow() - timedelta(minutes=1)
        db.commit()
    assert c.get("/api/auth/me").status_code == 401


# ---------- re-checking (view only, never UMS) ----------

def test_no_recheck_while_fresh(started, monkeypatch):
    c = sign_in("owner")
    calls = []
    monkeypatch.setattr(auth, "view_accesses", lambda uid: calls.append(uid) or [])
    c.get("/api/auth/me")
    c.get("/api/diagrams")
    assert calls == []


def test_demoted_then_removed(started):
    USERS["temp"] = 20
    grant(20, 3, "System Owner")
    c = sign_in("temp")
    assert c.get("/api/auth/check?role=owner").status_code == 204
    CALLS.clear()
    grant(20, 5, "Regular User")
    _age(c)
    assert c.get("/api/auth/check?role=owner").status_code == 403
    assert c.get("/api/auth/me").json()["role"] == "user"
    grant(20, None)  # access removed or made inactive in UMS
    _age(c)
    assert c.get("/api/auth/me").status_code == 401
    grant(20, 3, "System Owner")
    assert c.get("/api/auth/me").status_code == 401  # the session is gone, not just refused once
    assert CALLS == []  # re-checks read the view, not UMS
    del USERS["temp"]


# ---------- diagrams: who sees what ----------

def test_regular_users_only_see_their_own(started):
    a, b, owner = sign_in("regular"), sign_in("regular2"), sign_in("owner")
    mine = new_diagram(a, "A's diagram")
    for method in ("get", "put", "delete"):
        kwargs = {"json": {"title": "hacked"}} if method == "put" else {}
        assert getattr(b, method)(f"/api/diagrams/{mine}", **kwargs).status_code == 404, method
    assert mine not in [d["id"] for d in b.get("/api/diagrams").json()]
    assert mine in [d["id"] for d in a.get("/api/diagrams").json()]
    listed = {d["id"]: d for d in owner.get("/api/diagrams").json()}
    assert listed[mine]["owner_name"] == "Regular User"
    assert owner.put(f"/api/diagrams/{mine}", json={"title": "fixed by owner"}).status_code == 200
    assert a.get(f"/api/diagrams/{mine}").json()["title"] == "fixed by owner"


def test_old_diagrams_are_owner_only(started):
    with SessionLocal() as db:
        old = Diagram(title="from before sign-in", template_key="sipoc", data={"items": [], "edges": []})
        db.add(old)
        db.commit()
        old_id = old.id
    assert old_id not in [d["id"] for d in sign_in("regular").get("/api/diagrams").json()]
    assert sign_in("admin").get(f"/api/diagrams/{old_id}").status_code == 404
    assert sign_in("super").get(f"/api/diagrams/{old_id}").status_code == 200


def test_import_dates_are_owner_only(started):
    body = {"title": "imported", "template_key": "sipoc", "created_at": "2020-01-01T00:00:00Z"}
    assert sign_in("regular").post("/api/diagrams", json=body).status_code == 403
    r = sign_in("owner").post("/api/diagrams", json=body)
    assert r.status_code == 201 and r.json()["created_at"].startswith("2020-01-01")


def test_templates_for_any_signed_in_user(started):
    assert sign_in("admin").get("/api/templates").status_code == 200


# ---------- schema upgrade ----------

def test_owner_columns_added_to_an_old_database(tmp_path):
    old = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with old.begin() as conn:
        conn.execute(text("CREATE TABLE diagrams (id INTEGER PRIMARY KEY, title VARCHAR(200), "
                          "template_key VARCHAR(50), data JSON, created_at DATETIME, updated_at DATETIME)"))
        conn.execute(text("INSERT INTO diagrams (title, template_key, data) VALUES ('keep me', 'sipoc', '{}')"))
    add_owner_columns(old)
    add_owner_columns(old)  # running again on every start must be harmless
    cols = {c["name"] for c in inspect(old).get_columns("diagrams")}
    assert {"owner_id", "owner_name"} <= cols
    with old.connect() as conn:
        assert conn.execute(text("SELECT title, owner_id FROM diagrams")).all() == [("keep me", None)]
