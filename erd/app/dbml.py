"""Turn a reflected database schema into DBML (the language of dbdiagram.io)."""
from __future__ import annotations

import re
from typing import Any

_IDENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_SIMPLE_TYPE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*(\([0-9 ,]*\))?(\[\])?")
_NUMBER = re.compile(r"-?\d+(\.\d+)?")


def ident(name: str) -> str:
    return name if _IDENT.fullmatch(name) else '"' + name.replace('"', '\\"') + '"'


def table_name(schema: str | None, name: str) -> str:
    return f"{ident(schema)}.{ident(name)}" if schema else ident(name)


def type_str(t: str) -> str:
    t = " ".join(t.split())
    return t if _SIMPLE_TYPE.fullmatch(t) else '"' + t.replace('"', '\\"') + '"'


def quote(text: str) -> str:
    """DBML string: single quotes, or triple quotes for multi-line text."""
    if "\n" in text:
        return "'''" + text.replace("'''", "\\'''") + "'''"
    return "'" + text.replace("\\", "\\\\").replace("'", "\\'") + "'"


def default_str(raw: Any) -> tuple[str | None, bool]:
    """Database default → DBML default value. Returns (value, is_auto_increment)."""
    if raw is None:
        return None, False
    d = str(raw).strip()
    if d.lower().startswith("nextval("):          # PostgreSQL serial
        return None, True
    while d.startswith("(") and d.endswith(")"):    # SQL Server wraps defaults: ((0)), ('x')
        d = d[1:-1].strip()
    m = re.fullmatch(r"'((?:[^']|'')*)'(::[\w\s\".\[\]]+)?", d, flags=re.S)
    if m:                                            # 'text' or 'text'::type
        return quote(m.group(1).replace("''", "'")), False
    if _NUMBER.fullmatch(d) or d.lower() in ("true", "false", "null"):
        return d.lower() if d.lower() in ("true", "false", "null") else d, False
    return "`" + d.replace("`", "'") + "`", False   # any other expression: now(), CURRENT_TIMESTAMP …


def to_dbml(model: dict[str, Any], header: str = "") -> str:
    out: list[str] = []
    if header:
        out += [f"// {line}" for line in header.splitlines()] + [""]

    for t in model["tables"]:
        name = table_name(t.get("schema"), t["name"])
        out.append(f"Table {name} {{")
        single_pk = t["pk"] if len(t["pk"]) == 1 else []
        single_unique = {u[0] for u in t["uniques"] if len(u) == 1}
        for c in t["columns"]:
            settings: list[str] = []
            default, serial = default_str(c.get("default"))
            if c["name"] in single_pk:
                settings.append("pk")
            if c.get("autoincrement") or serial:
                settings.append("increment")
            if not c["nullable"] and c["name"] not in single_pk:
                settings.append("not null")
            if c["name"] in single_unique and c["name"] not in single_pk:
                settings.append("unique")
            if default is not None:
                settings.append(f"default: {default}")
            if c.get("comment"):
                settings.append(f"note: {quote(c['comment'])}")
            suffix = f" [{', '.join(settings)}]" if settings else ""
            out.append(f"  {ident(c['name'])} {type_str(c['type'])}{suffix}")

        index_lines: list[str] = []
        if len(t["pk"]) > 1:
            index_lines.append(f"    ({', '.join(ident(c) for c in t['pk'])}) [pk]")
        for u in t["uniques"]:
            if len(u) > 1:
                index_lines.append(f"    ({', '.join(ident(c) for c in u)}) [unique]")
        for ix in t["indexes"]:
            cols = [c for c in ix["columns"] if c]
            if not cols or (ix["unique"] and (cols in t["uniques"] or cols == t["pk"])):
                continue
            opts = ["unique"] if ix["unique"] else []
            if ix.get("name"):
                opts.append(f"name: {quote(ix['name'])}")
            target = ident(cols[0]) if len(cols) == 1 else f"({', '.join(ident(c) for c in cols)})"
            settings = f" [{', '.join(opts)}]" if opts else ""
            index_lines.append(f"    {target}{settings}")
        if index_lines:
            out += ["", "  Indexes {", *index_lines, "  }"]
        if t.get("comment"):
            out += ["", f"  Note: {quote(t['comment'])}"]
        out += ["}", ""]

    for r in model["refs"]:
        src = table_name(r.get("from_schema"), r["from_table"])
        dst = table_name(r.get("to_schema"), r["to_table"])
        fc, tc = r["from_columns"], r["to_columns"]
        left = f"{src}.{ident(fc[0])}" if len(fc) == 1 else f"{src}.({', '.join(ident(c) for c in fc)})"
        right = f"{dst}.{ident(tc[0])}" if len(tc) == 1 else f"{dst}.({', '.join(ident(c) for c in tc)})"
        op = "-" if r.get("one_to_one") else ">"
        label = f" {r['name']}" if r.get("name") and _IDENT.fullmatch(r["name"]) else ""
        out.append(f"Ref{label}: {left} {op} {right}")
    return "\n".join(out).rstrip() + "\n"
