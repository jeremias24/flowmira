"""flowmira-erd: database ERDs for Flowmira (view live database schemas, or write DBML)."""
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from . import config
from .database import Base, engine
from .routers import erd

log = logging.getLogger("uvicorn.error")


def wait_for_database(attempts: int = 30, delay: float = 2.0) -> None:
    for attempt in range(1, attempts + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except OperationalError as exc:
            log.warning("Database not ready (attempt %s/%s): %s", attempt, attempts, exc.orig)
            time.sleep(delay)
    raise RuntimeError("Could not connect to Flowmira's database. Check DATABASE_URL.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    wait_for_database()
    Base.metadata.create_all(bind=engine)  # creates erd_documents only; never touches other tables
    yield


app = FastAPI(title="Flowmira ERD API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
app.include_router(erd.router)
