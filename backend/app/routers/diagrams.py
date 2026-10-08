from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session, defer  # ── FIX ── + defer
from ..auth import current_user, is_owner  # ── NEW ──
from ..database import get_db
from ..ids import decode_id  # ── NEW ──
from ..models import AuthSession, Diagram, Template
from ..schemas import DiagramCreate, DiagramOut, DiagramSummary, DiagramUpdate

router = APIRouter(prefix="/api/diagrams", tags=["diagrams"])


def _get_or_404(db: Session, diagram_id: int, user: AuthSession) -> Diagram:
    diagram = db.get(Diagram, diagram_id)
    # ── FIX ── Regular users only reach their own diagrams; someone else's is "not found".
    if diagram is None or not (is_owner(user) or diagram.owner_id == user.user_id):
        raise HTTPException(404, f"Diagram {diagram_id} not found")
    return diagram


@router.get("", response_model=list[DiagramSummary])
def list_diagrams(db: Session = Depends(get_db), user: AuthSession = Depends(current_user)):
    # ── FIX ── The list shows titles only: don't read every diagram's pictures for it.
    query = db.query(Diagram).options(defer(Diagram.data))
    # ── FIX ── System owners see everything, including diagrams from before sign-in existed.
    if not is_owner(user):
        query = query.filter(Diagram.owner_id == user.user_id)
    return query.order_by(Diagram.updated_at.desc()).all()


@router.post("", response_model=DiagramOut, status_code=201)
def create_diagram(payload: DiagramCreate, db: Session = Depends(get_db),
                   user: AuthSession = Depends(current_user)):
    # ── NEW ── Only an import sends dates, and importing is for system owners.
    if (payload.created_at is not None or payload.updated_at is not None) and not is_owner(user):
        raise HTTPException(403, "Only system owners can import diagrams.")
    if not db.query(Template).filter(Template.key == payload.template_key).first():
        raise HTTPException(400, f"Unknown template '{payload.template_key}'")
    diagram = Diagram(title=payload.title, template_key=payload.template_key,
                      data=payload.data.model_dump(),
                      owner_id=user.user_id, owner_name=user.full_name)  # ── FIX ──
    # ── NEW ── Imported diagrams keep their original dates (None = now, via the model default).
    if payload.created_at is not None:
        diagram.created_at = payload.created_at
    if payload.updated_at is not None:
        diagram.updated_at = payload.updated_at
    db.add(diagram)
    db.commit()
    db.refresh(diagram)
    return diagram


# ── NEW ── Open a diagram from its address. A ref that isn't valid is "not found", like a
# diagram the user may not see. Declared before /{diagram_id}.
@router.get("/by-ref/{ref}", response_model=DiagramOut)
def get_diagram_by_ref(ref: str, db: Session = Depends(get_db),
                       user: AuthSession = Depends(current_user)):
    diagram_id = decode_id("diagram", ref)
    if diagram_id is None:
        raise HTTPException(404, "Diagram not found")
    return _get_or_404(db, diagram_id, user)


@router.get("/{diagram_id}", response_model=DiagramOut)
def get_diagram(diagram_id: int, db: Session = Depends(get_db),
                user: AuthSession = Depends(current_user)):
    return _get_or_404(db, diagram_id, user)


@router.put("/{diagram_id}", response_model=DiagramOut)
def update_diagram(diagram_id: int, payload: DiagramUpdate, db: Session = Depends(get_db),
                   user: AuthSession = Depends(current_user)):
    diagram = _get_or_404(db, diagram_id, user)
    if payload.title is not None:
        diagram.title = payload.title
    if payload.data is not None:
        diagram.data = payload.data.model_dump()
    db.commit()
    db.refresh(diagram)
    return diagram


@router.delete("/{diagram_id}", status_code=204)
def delete_diagram(diagram_id: int, db: Session = Depends(get_db),
                   user: AuthSession = Depends(current_user)):
    diagram = _get_or_404(db, diagram_id, user)
    db.delete(diagram)
    db.commit()
    return Response(status_code=204)
