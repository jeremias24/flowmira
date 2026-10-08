from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from ..database import get_db
from ..introspect import IntrospectError, engines, introspect
from ..models import ErdDocument
from ..schemas import (
    ConnectionRequest, DocumentCreate, DocumentOut, DocumentSummary, DocumentUpdate, EngineInfo, IntrospectResult,
)

router = APIRouter(prefix="/api/erd", tags=["erd"])


@router.get("/health")
def health():
    return {"status": "ok", "service": "flowmira-erd"}


@router.get("/engines", response_model=list[EngineInfo])
def list_engines():
    """Database types this server can read (drivers installed)."""
    return engines()


@router.post("/introspect", response_model=IntrospectResult)
async def read_schema(req: ConnectionRequest):
    """Read a database's structure (view only) and return it as DBML. Credentials are not stored."""
    try:
        return await run_in_threadpool(introspect, req)
    except IntrospectError as e:
        raise HTTPException(400, str(e)) from None


# ----------------------------------------------------------------------------- documents
def _get(db: Session, doc_id: int) -> ErdDocument:
    doc = db.get(ErdDocument, doc_id)
    if doc is None:
        raise HTTPException(404, f"ERD {doc_id} not found")
    return doc


@router.get("/documents", response_model=list[DocumentSummary])
def list_documents(db: Session = Depends(get_db)):
    return db.query(ErdDocument).order_by(ErdDocument.updated_at.desc()).all()


@router.post("/documents", response_model=DocumentOut, status_code=201)
def create_document(payload: DocumentCreate, db: Session = Depends(get_db)):
    info = dict(payload.source_info or {})
    info.pop("password", None)  # belt and braces: never store credentials
    doc = ErdDocument(title=payload.title, dbml=payload.dbml, layout=payload.layout,
                      source=payload.source, source_info=info or None)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/documents/{doc_id}", response_model=DocumentOut)
def get_document(doc_id: int, db: Session = Depends(get_db)):
    return _get(db, doc_id)


@router.put("/documents/{doc_id}", response_model=DocumentOut)
def update_document(doc_id: int, payload: DocumentUpdate, db: Session = Depends(get_db)):
    doc = _get(db, doc_id)
    if payload.title is not None:
        doc.title = payload.title
    if payload.layout is not None:
        doc.layout = payload.layout
    if payload.dbml is not None:
        # ERDs read from a live database are view only: their DBML can only change by refreshing.
        if doc.source == "database":
            raise HTTPException(409, "This ERD was read from a database and is view only. Refresh it, or make an editable copy.")
        doc.dbml = payload.dbml
    db.commit()
    db.refresh(doc)
    return doc


@router.post("/documents/{doc_id}/refresh", response_model=DocumentOut)
async def refresh_document(doc_id: int, req: ConnectionRequest, db: Session = Depends(get_db)):
    """Re-read a database ERD (credentials needed again, they're never stored). Keeps the layout."""
    doc = _get(db, doc_id)
    if doc.source != "database":
        raise HTTPException(409, "Only ERDs read from a database can be refreshed.")
    try:
        result = await run_in_threadpool(introspect, req)
    except IntrospectError as e:
        raise HTTPException(400, str(e)) from None
    doc.dbml = result["dbml"]
    doc.source_info = result["source_info"]
    db.commit()
    db.refresh(doc)
    return doc


@router.delete("/documents/{doc_id}", status_code=204)
def delete_document(doc_id: int, db: Session = Depends(get_db)):
    db.delete(_get(db, doc_id))
    db.commit()
    return Response(status_code=204)
