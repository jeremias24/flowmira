from datetime import datetime, timezone
from sqlalchemy import JSON, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base


def utcnow():
    return datetime.now(timezone.utc)


class ErdDocument(Base):
    """An ERD: DBML text plus where each table sits on the canvas."""
    __tablename__ = "erd_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    dbml: Mapped[str] = mapped_column(Text, default="")
    # {"tables": {"public.users": {"x": 0, "y": 0}}, "colors": {...}}
    layout: Mapped[dict] = mapped_column(JSON, default=dict)
    # "dbml" = written by hand (editable); "database" = read from a live database (view only)
    source: Mapped[str] = mapped_column(String(20), default="dbml")
    # Where a "database" ERD came from: engine, host, port, database, schema. NEVER the password.
    source_info: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
