"""Read a database's structure (tables, columns, keys, relationships) without reading data.

Safety:
- SQLAlchemy's inspector only queries the database catalog (information_schema / pg_catalog /
  sys views); it never selects rows from your tables.
- PostgreSQL and MySQL sessions are additionally forced READ ONLY, with statement timeouts.
- Connection credentials are used once and never stored; errors never include the password.
- Cloud metadata / link-local addresses are always blocked; set ERD_ALLOWED_HOSTS to
  restrict which servers may be inspected.
"""
from __future__ import annotations

import fnmatch
import importlib.util
import ipaddress
import socket
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import create_engine, event, inspect
from sqlalchemy.engine import URL, Engine
from sqlalchemy.exc import NoSuchTableError, SQLAlchemyError
from sqlalchemy.pool import NullPool

from . import config
from .dbml import to_dbml
from .schemas import ConnectionRequest

ENGINES: dict[str, dict[str, Any]] = {
    "postgresql": {"label": "PostgreSQL", "driver": "postgresql+psycopg", "port": 5432, "module": "psycopg"},
    "mysql": {"label": "MySQL / MariaDB", "driver": "mysql+pymysql", "port": 3306, "module": "pymysql"},
    "mssql": {"label": "SQL Server", "driver": "mssql+pymssql", "port": 1433, "module": "pymssql"},
    "sqlite": {"label": "SQLite file (testing only)", "driver": "sqlite", "port": None, "module": "sqlite3"},
}


class IntrospectError(Exception):
    """A problem worth showing to the user as-is (no secrets inside)."""


def engines() -> list[dict[str, Any]]:
    out = []
    for key, e in ENGINES.items():
        if key == "sqlite" and not config.ALLOW_SQLITE:
            continue
        out.append({"key": key, "label": e["label"], "default_port": e["port"],
                    "available": importlib.util.find_spec(e["module"]) is not None})
    return out


# ------------------------------------------------------------------------------- safety
LOCAL_NAMES = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}


def target_host(host: str) -> str:
    """In Docker, 'localhost' would mean the container itself; the user means their computer."""
    if config.IN_DOCKER and host.strip().lower() in LOCAL_NAMES:
        return config.DOCKER_HOST_ALIAS
    return host.strip()



def check_host(host: str) -> None:
    if not host:
        raise IntrospectError("Enter the database server's host name or IP address.")
    try:
        addresses = {ai[4][0] for ai in socket.getaddrinfo(host, None)}
    except socket.gaierror:
        if host == config.DOCKER_HOST_ALIAS:
            raise IntrospectError(
                f"{host} isn't available in this container. Add extra_hosts: \"{host}:host-gateway\" "
                "to the erd service in docker-compose.yml.") from None
        raise IntrospectError(f"Can't find a server called “{host}”. Check the host name.") from None
    ips = [ipaddress.ip_address(a.split("%")[0]) for a in addresses]
    for ip in ips:
        if ip.is_link_local or ip.is_multicast or ip.is_unspecified:
            raise IntrospectError("That address isn't allowed (link-local / cloud metadata).")
    if config.ALLOWED_HOSTS:
        def allowed(rule: str) -> bool:
            if "/" in rule:
                try:
                    net = ipaddress.ip_network(rule, strict=False)
                    return any(ip in net for ip in ips)
                except ValueError:
                    return False
            return fnmatch.fnmatch(host.lower(), rule.lower())
        if not any(allowed(r) for r in config.ALLOWED_HOSTS):
            raise IntrospectError(f"“{host}” isn't on this Flowmira server's list of allowed database hosts.")


def _engine(req: ConnectionRequest) -> Engine:
    spec = ENGINES[req.engine]
    t = config.CONNECT_TIMEOUT
    if req.engine == "sqlite":
        if not config.ALLOW_SQLITE:
            raise IntrospectError("SQLite is only available in test mode.")
        return create_engine(f"sqlite:///file:{req.database}?mode=ro&uri=true", poolclass=NullPool)

    host = target_host(req.host)
    check_host(host)
    query: dict[str, str] = {}
    connect_args: dict[str, Any] = {}
    if req.engine == "postgresql":
        connect_args = {"connect_timeout": t,
                        "options": "-c default_transaction_read_only=on -c statement_timeout=30000"}
        if req.ssl:
            query["sslmode"] = "require"
    elif req.engine == "mysql":
        connect_args = {"connect_timeout": t, "read_timeout": 30, "write_timeout": 30}
        if req.ssl:
            connect_args["ssl"] = {"check_hostname": False}
    elif req.engine == "mssql":
        connect_args = {"login_timeout": t, "timeout": 30}

    url = URL.create(spec["driver"], username=req.username or None, password=req.password or None,
                     host=host, port=req.port or spec["port"], database=req.database, query=query)
    eng = create_engine(url, connect_args=connect_args, poolclass=NullPool)
    if req.engine == "mysql":
        @event.listens_for(eng, "connect")
        def _read_only(dbapi_conn, _record):  # noqa: ANN001
            with dbapi_conn.cursor() as cur:
                cur.execute("SET SESSION TRANSACTION READ ONLY")
    return eng


def _friendly(err: Exception, req: ConnectionRequest) -> str:
    """A helpful message without credentials."""
    text = str(getattr(err, "orig", err)).replace(req.password, "***") if req.password else str(getattr(err, "orig", err))
    low = text.lower()
    if "is not allowed to connect" in low:
        # MySQL/MariaDB: the user exists only for localhost, but Flowmira connects from Docker.
        return ("MySQL doesn't let this user connect from Flowmira's Docker network. Create a user for it, e.g. "
                f"CREATE USER 'fluix_reader'@'172.%' IDENTIFIED BY '…'; GRANT SELECT, SHOW VIEW ON {req.database}.* "
                "TO 'fluix_reader'@'172.%';")
    if "no pg_hba.conf entry" in low:
        return ("PostgreSQL doesn't accept connections from Flowmira's Docker network. Add a line to pg_hba.conf, e.g. "
                "host all all 172.16.0.0/12 scram-sha-256, then reload PostgreSQL.")
    if "password authentication failed" in low or "access denied" in low or "login failed" in low:
        return "The database rejected the username or password."
    if "does not exist" in low and "database" in low or "unknown database" in low:
        return f"The database “{req.database}” doesn't exist on that server."
    if "timeout" in low or "timed out" in low:
        return "The database server didn't answer in time. Check host, port and firewall."
    if "connection refused" in low or "could not connect" in low or "can't connect" in low:
        port = req.port or ENGINES[req.engine]["port"]
        if target_host(req.host) != req.host.strip():
            return (f"Couldn't reach the database on your computer (port {port}). Make sure it's running and accepts "
                    "network connections (MySQL: bind-address = 0.0.0.0 in my.ini; PostgreSQL: listen_addresses = '*'), "
                    "and that the firewall allows the port.")
        hint = " (Database on this computer? Use host.docker.internal.)" if req.host.strip().lower() in LOCAL_NAMES else ""
        return f"Couldn't connect to {req.host}:{port}.{hint}"
    return "The database returned an error: " + text.splitlines()[0][:300]


# -------------------------------------------------------------------------- reflection
def _type_name(col: dict[str, Any], dialect) -> str:  # noqa: ANN001
    try:
        return col["type"].compile(dialect=dialect)
    except Exception:  # noqa: BLE001 - unknown/vendor types
        return str(col["type"]) if str(col["type"]) else "unknown"


def _safe(fn, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003
    """Some dialects don't implement every reflection call (e.g. comments); treat as empty."""
    try:
        return fn(*args, **kwargs)
    except (NotImplementedError, NoSuchTableError):
        return None


def introspect(req: ConnectionRequest) -> dict[str, Any]:
    if req.engine not in ENGINES or (req.engine == "sqlite" and not config.ALLOW_SQLITE):
        raise IntrospectError("Unsupported database type.")
    if importlib.util.find_spec(ENGINES[req.engine]["module"]) is None:
        raise IntrospectError(f"The {ENGINES[req.engine]['label']} driver isn't installed on this server.")

    eng = _engine(req)
    warnings: list[str] = []
    try:
        with eng.connect() as conn:
            insp = inspect(conn)
            schema = req.db_schema or None
            names = sorted(insp.get_table_names(schema=schema))
            if len(names) > config.MAX_TABLES:
                warnings.append(f"Showing the first {config.MAX_TABLES} of {len(names)} tables.")
                names = names[: config.MAX_TABLES]
            views = _safe(insp.get_view_names, schema=schema) or []
            if views:
                warnings.append(f"{len(views)} view(s) not shown (ERDs show tables only).")

            # One catalog query per kind of information, instead of one per table.
            kw = {"schema": schema, "filter_names": names}
            cols = insp.get_multi_columns(**kw)
            pks = insp.get_multi_pk_constraint(**kw)
            fks = insp.get_multi_foreign_keys(**kw)
            uqs = _safe(insp.get_multi_unique_constraints, **kw) or {}
            ixs = _safe(insp.get_multi_indexes, **kw) or {}
            cms = _safe(insp.get_multi_table_comment, **kw) or {}
            dialect = conn.dialect
    except SQLAlchemyError as e:
        raise IntrospectError(_friendly(e, req)) from None
    finally:
        eng.dispose()

    tables, refs = [], []
    known = set(names)
    for name in names:
        key = (schema, name)
        pk = (pks.get(key) or {}).get("constrained_columns") or []
        uniques = [u["column_names"] for u in uqs.get(key, []) if u.get("column_names")]
        tables.append({
            "schema": req.db_schema or None,
            "name": name,
            "pk": pk,
            "uniques": uniques,
            "indexes": [{"name": i.get("name"), "columns": i.get("column_names") or [], "unique": bool(i.get("unique"))}
                        for i in ixs.get(key, [])],
            "comment": (cms.get(key) or {}).get("text"),
            "columns": [{
                "name": c["name"],
                "type": _type_name(c, dialect),
                "nullable": bool(c.get("nullable", True)),
                "default": c.get("default"),
                "autoincrement": c.get("autoincrement") is True or bool(c.get("identity")),
                "comment": c.get("comment"),
            } for c in cols.get(key, [])],
        })
        for fk in fks.get(key, []):
            target = fk.get("referred_table")
            if not target or fk.get("referred_schema") not in (None, schema) or target not in known:
                warnings.append(f"Relationship {name} → {target} skipped (other schema or not shown).")
                continue
            from_cols = fk.get("constrained_columns") or []
            one_to_one = from_cols == pk or from_cols in uniques
            refs.append({"name": fk.get("name"), "from_schema": req.db_schema or None, "from_table": name,
                         "from_columns": from_cols, "to_schema": req.db_schema or None, "to_table": target,
                         "to_columns": fk.get("referred_columns") or [], "one_to_one": one_to_one})

    file_based = req.engine == "sqlite"
    source = {"engine": req.engine, "host": "" if file_based else req.host,
              "port": None if file_based else req.port or ENGINES[req.engine]["port"],
              "database": req.database, "schema": req.db_schema, "username": req.username}
    where = f"{ENGINES[req.engine]['label']} · " + (req.database if file_based else f"{req.host}/{req.database}") + (f" · schema {req.db_schema}" if req.db_schema else "")
    header = f"Read from {where}\non {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC by Flowmira ERD (view only)."
    return {"dbml": to_dbml({"tables": tables, "refs": refs}, header), "tables": len(tables), "refs": len(refs),
            "warnings": warnings, "source_info": source}
