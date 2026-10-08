from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field


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


class DiagramUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    data: DiagramData | None = None


class DiagramSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    template_key: str
    updated_at: datetime


class DiagramOut(DiagramSummary):
    data: DiagramData
    created_at: datetime
