from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..auth import current_user  # ── NEW ──
from ..database import get_db
from ..models import Template
from ..schemas import TemplateOut, TemplateSummary

# ── FIX ── signed-in users only
router = APIRouter(prefix="/api/templates", tags=["templates"], dependencies=[Depends(current_user)])


@router.get("", response_model=list[TemplateSummary])
def list_templates(db: Session = Depends(get_db)):
    return db.query(Template).order_by(Template.name).all()


@router.get("/{key}", response_model=TemplateOut)
def get_template(key: str, db: Session = Depends(get_db)):
    template = db.query(Template).filter(Template.key == key).first()
    if template is None:
        raise HTTPException(404, f"Template '{key}' not found")
    return template
