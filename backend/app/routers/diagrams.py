from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Diagram, Template
from ..schemas import DiagramCreate, DiagramOut, DiagramSummary, DiagramUpdate

router = APIRouter(prefix="/api/diagrams", tags=["diagrams"])


def _get_or_404(db: Session, diagram_id: int) -> Diagram:
    diagram = db.get(Diagram, diagram_id)
    if diagram is None:
        raise HTTPException(404, f"Diagram {diagram_id} not found")
    return diagram


@router.get("", response_model=list[DiagramSummary])
def list_diagrams(db: Session = Depends(get_db)):
    return db.query(Diagram).order_by(Diagram.updated_at.desc()).all()


@router.post("", response_model=DiagramOut, status_code=201)
def create_diagram(payload: DiagramCreate, db: Session = Depends(get_db)):
    if not db.query(Template).filter(Template.key == payload.template_key).first():
        raise HTTPException(400, f"Unknown template '{payload.template_key}'")
    diagram = Diagram(title=payload.title, template_key=payload.template_key,
                      data=payload.data.model_dump())
    db.add(diagram)
    db.commit()
    db.refresh(diagram)
    return diagram


@router.get("/{diagram_id}", response_model=DiagramOut)
def get_diagram(diagram_id: int, db: Session = Depends(get_db)):
    return _get_or_404(db, diagram_id)


@router.put("/{diagram_id}", response_model=DiagramOut)
def update_diagram(diagram_id: int, payload: DiagramUpdate, db: Session = Depends(get_db)):
    diagram = _get_or_404(db, diagram_id)
    if payload.title is not None:
        diagram.title = payload.title
    if payload.data is not None:
        diagram.data = payload.data.model_dump()
    db.commit()
    db.refresh(diagram)
    return diagram


@router.delete("/{diagram_id}", status_code=204)
def delete_diagram(diagram_id: int, db: Session = Depends(get_db)):
    diagram = _get_or_404(db, diagram_id)
    db.delete(diagram)
    db.commit()
    return Response(status_code=204)
