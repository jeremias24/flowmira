from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Template
from ..schemas import TemplateOut, TemplateSummary

router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.get("", response_model=list[TemplateSummary])
def list_templates(db: Session = Depends(get_db)):
    return db.query(Template).order_by(Template.name).all()


@router.get("/{key}", response_model=TemplateOut)
def get_template(key: str, db: Session = Depends(get_db)):
    template = db.query(Template).filter(Template.key == key).first()
    if template is None:
        raise HTTPException(404, f"Template '{key}' not found")
    return template
