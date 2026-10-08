from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, computed_field  # ── FIX ── + computed_field
from .ids import encode_id  # ── NEW ──


class TemplateSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    key: str
    name: str
    version: int
    accent: str | None = None


class TemplateOut(TemplateSummary):
    definition: dict[str, Any]


class DiagramData(BaseModel):
    items: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)
    # Per-diagram zones (e.g. swimlane lanes) for templates with "editableZones": true.
    # None = use the template's zones.
    zones: list[dict[str, Any]] | None = None
    # Per-diagram column/lane sizes: {"length": int, "sizes": {zone_id: int}}. None = template sizes.
    layout: dict[str, Any] | None = None
    # Diagram-wide settings, e.g. {"animationSpeed": "slow"}.
    settings: dict[str, Any] | None = None


class DiagramCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    template_key: str
    data: DiagramData = Field(default_factory=DiagramData)
    # ── NEW ── Set only when importing a .flowmira file, to keep the original dates.
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DiagramUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    data: DiagramData | None = None


class DiagramSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    template_key: str
    updated_at: datetime
    # ── NEW ── Who made it (None = made before sign-in existed).
    owner_name: str | None = None

    # ── NEW ── Encrypted id for the address bar (/flowmira/diagram/<ref>).
    @computed_field  # type: ignore[prop-decorator]
    @property
    def ref(self) -> str:
        return encode_id("diagram", self.id)


class DiagramOut(DiagramSummary):
    data: DiagramData
    created_at: datetime


# ── NEW ──
class LoginRequest(BaseModel):
    credentials: str = Field(min_length=1, max_length=4096)


class Me(BaseModel):
    id: str
    full_name: str
    email: str | None = None
    user_type: str
    role: Literal["owner", "user"]
