from contextlib import asynccontextmanager
import logging
import os
import time
from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from fastapi.middleware.cors import CORSMiddleware
from .database import Base, SessionLocal, engine
from .routers import diagrams, templates
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    wait_for_database()
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_templates(db)
    yield


app = FastAPI(title="Flowmira API", version="0.1.0", lifespan=lifespan)

origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])

app.include_router(templates.router)
app.include_router(diagrams.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
