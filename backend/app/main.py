from contextlib import asynccontextmanager
import logging
import os
import time
from fastapi import FastAPI
from sqlalchemy import Engine, inspect, text  # ── FIX ── + Engine, inspect
from sqlalchemy.exc import OperationalError
from fastapi.middleware.cors import CORSMiddleware
from .database import Base, SessionLocal, engine
from .routers import auth, diagrams, templates  # ── FIX ── + auth
from .seed import seed_templates


log = logging.getLogger("uvicorn.error")


def wait_for_database(attempts: int = 30, delay: float = 2.0) -> None:
    """Retry until the database accepts connections (Postgres can take a few seconds)."""
    for attempt in range(1, attempts + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            if attempt > 1:
                log.info("Database is ready.")
            return
        except OperationalError as exc:
            log.warning("Database not ready (attempt %s/%s): %s", attempt, attempts, exc.orig)
            time.sleep(delay)
    raise RuntimeError("Could not connect to the database. Check DATABASE_URL and the db container logs.")


# ── NEW ──
def add_owner_columns(bind: Engine) -> None:
    """create_all() never adds columns to an existing table, so add the owner columns once.
    Only adds; existing rows keep owner_id = NULL (visible to system owners only)."""
    existing = {c["name"] for c in inspect(bind).get_columns("diagrams")}
    with bind.begin() as conn:
        if "owner_id" not in existing:
            conn.execute(text("ALTER TABLE diagrams ADD COLUMN owner_id VARCHAR(64)"))
            log.info("Added diagrams.owner_id")
        if "owner_name" not in existing:
            conn.execute(text("ALTER TABLE diagrams ADD COLUMN owner_name VARCHAR(200)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_diagrams_owner_id ON diagrams (owner_id)"))


# ── NEW ── additive upgrade; old sessions reauthenticate to populate these fields.
def add_access_identity_columns(bind: Engine) -> None:
    existing = {c["name"] for c in inspect(bind).get_columns("auth_sessions")}
    with bind.begin() as conn:
        for name in ("employee_id", "user_class_id"):
            if name not in existing:
                conn.execute(text(f"ALTER TABLE auth_sessions ADD COLUMN {name} INTEGER"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    wait_for_database()
    Base.metadata.create_all(bind=engine)  # also creates auth_sessions
    add_access_identity_columns(engine)
    add_owner_columns(engine)  # ── NEW ──
    with SessionLocal() as db:
        seed_templates(db)
    yield


app = FastAPI(title="Flowmira API", version="0.1.0", lifespan=lifespan)

origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
# ── FIX ── allow_credentials: in development the app (:5173) and API (:8000) are different
# origins and the session cookie must be sent. Origins stay an explicit list, never "*".
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

app.include_router(auth.router)  # ── NEW ──
app.include_router(templates.router)
app.include_router(diagrams.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
