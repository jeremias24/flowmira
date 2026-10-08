from datetime import datetime, timezone
from sqlalchemy import JSON, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Template(Base):
    """A diagram type (SIPOC, DMAIC, fishbone...) defined entirely as JSON."""
    __tablename__ = "templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    version: Mapped[int] = mapped_column(Integer, default=1)
    definition: Mapped[dict] = mapped_column(JSON)

    @property
    def accent(self) -> str | None:
        """Brand colour for this diagram type (from the template JSON)."""
        return (self.definition or {}).get("accent")


class Diagram(Base):
    """A user's diagram. Only items + edges are stored; zones come from the template."""
    __tablename__ = "diagrams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    template_key: Mapped[str] = mapped_column(String(50), index=True)
    data: Mapped[dict] = mapped_column(JSON, default=lambda: {"items": [], "edges": []})
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    # ── NEW ── UMS user id of whoever created it. None = made before sign-in existed (owners only).
    # Existing databases get these columns from main.add_owner_columns().
    owner_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    owner_name: Mapped[str | None] = mapped_column(String(200), nullable=True)


# ── NEW ──
class AuthSession(Base):
    """A signed-in browser. The cookie holds a random token; only its SHA-256 is stored here."""
    __tablename__ = "auth_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # sha256(cookie token), hex
    user_id: Mapped[str] = mapped_column(String(64), index=True)  # UMS users.id
    # ── NEW ── UMS identity needed for stored-procedure re-checks.
    employee_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_class_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    username: Mapped[str | None] = mapped_column(String(120), nullable=True)
    employee_no: Mapped[str | None] = mapped_column(String(50), nullable=True)
    full_name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    user_type_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_type: Mapped[str] = mapped_column(String(60))
    role: Mapped[str] = mapped_column(String(10))  # "owner" | "user"
    # Unused since access is read from user_system_active_accesses_vw; always "". Kept because the
    # table already exists with this NOT NULL column (create_all never alters tables).
    ums_token: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
