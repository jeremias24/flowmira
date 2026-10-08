"""Load every *.json file in /templates into the database on startup.
Adding a new diagram type = dropping a new JSON file in that folder."""
import json
from pathlib import Path
from sqlalchemy.orm import Session
from .models import Template

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"


def seed_templates(db: Session) -> None:
    for path in sorted(TEMPLATE_DIR.glob("*.json")):
        definition = json.loads(path.read_text(encoding="utf-8"))
        key = definition["key"]
        existing = db.query(Template).filter(Template.key == key).first()
        if existing is None:
            db.add(Template(key=key, name=definition["name"],
                            version=definition.get("version", 1), definition=definition))
        elif definition.get("version", 1) > existing.version:
            existing.name = definition["name"]
            existing.version = definition["version"]
            existing.definition = definition
    db.commit()
