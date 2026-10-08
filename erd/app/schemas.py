from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field

Engine = Literal["postgresql", "mysql", "mssql", "sqlite"]


class ConnectionRequest(BaseModel):
    """Credentials for one introspection. Used once, never stored or logged."""
    engine: Engine
    host: str = Field(default="", max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    database: str = Field(min_length=1, max_length=255)
    username: str = Field(default="", max_length=255)
    password: str = Field(default="", max_length=1024)
    # Schema to read; empty = the engine's default (public / the database / dbo).
    db_schema: str = Field(default="", max_length=255, alias="schema")
    ssl: bool = False

    model_config = ConfigDict(populate_by_name=True)


class SourceInfo(BaseModel):
    engine: str
    host: str
    port: int | None
    database: str
    db_schema: str = Field(alias="schema")
    username: str

    model_config = ConfigDict(populate_by_name=True)


class IntrospectResult(BaseModel):
    dbml: str
    tables: int
    refs: int
    warnings: list[str]
    source_info: dict[str, Any]


class EngineInfo(BaseModel):
    key: str
    label: str
    default_port: int | None
    available: bool


class DocumentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    dbml: str = ""
    layout: dict[str, Any] = Field(default_factory=dict)
    source: Literal["dbml", "database"] = "dbml"
    source_info: dict[str, Any] | None = None


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    dbml: str | None = None
    layout: dict[str, Any] | None = None


class DocumentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    source: str
    updated_at: datetime


class DocumentOut(DocumentSummary):
    dbml: str
    layout: dict[str, Any]
    source_info: dict[str, Any] | None
    created_at: datetime
