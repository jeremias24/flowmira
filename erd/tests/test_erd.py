"""Run:  cd erd && pip install -r requirements.txt pytest httpx && ERD_ALLOW_SQLITE=1 pytest -q"""
import os
import sqlite3

import pytest

os.environ.setdefault("ERD_ALLOW_SQLITE", "1")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_erd_docs.db")

from fastapi.testclient import TestClient  # noqa: E402

from app.dbml import default_str, to_dbml  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def sample_db(tmp_path_factory):
    path = tmp_path_factory.mktemp("db") / "shop.db"
    c = sqlite3.connect(path)
    c.executescript("""
        CREATE TABLE customers (id INTEGER PRIMARY KEY, email VARCHAR(120) NOT NULL);
        CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id),
                             status VARCHAR(20) DEFAULT 'new');
        CREATE TABLE order_lines (order_id INTEGER REFERENCES orders(id), line_no INTEGER, qty INTEGER,
                                  PRIMARY KEY (order_id, line_no));
    """)
    c.commit()
    c.close()
    return str(path)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c
    if os.path.exists("test_erd_docs.db"):
        os.remove("test_erd_docs.db")


def test_introspect_reads_tables_and_relationships(client, sample_db):
    r = client.post("/api/erd/introspect", json={"engine": "sqlite", "database": sample_db})
    assert r.status_code == 200
    body = r.json()
    assert body["tables"] == 3 and body["refs"] == 2
    assert "Ref: orders.customer_id > customers.id" in body["dbml"]
    assert "(order_id, line_no) [pk]" in body["dbml"]


@pytest.mark.parametrize("host", ["169.254.169.254", "fe80::1"])
def test_metadata_and_link_local_hosts_are_blocked(client, host):
    r = client.post("/api/erd/introspect", json={
        "engine": "postgresql", "host": host, "database": "x", "username": "u", "password": "topsecret"})
    assert r.status_code == 400
    assert "topsecret" not in r.text


def test_password_never_stored(client):
    d = client.post("/api/erd/documents", json={
        "title": "t", "dbml": "", "source": "database", "source_info": {"engine": "postgresql", "password": "topsecret"}}).json()
    assert "topsecret" not in str(client.get(f"/api/erd/documents/{d['id']}").json())


def test_database_erds_are_view_only(client):
    d = client.post("/api/erd/documents", json={"title": "t", "dbml": "", "source": "database"}).json()
    assert client.put(f"/api/erd/documents/{d['id']}", json={"dbml": "Table x {\n id int\n}"}).status_code == 409
    assert client.put(f"/api/erd/documents/{d['id']}", json={"layout": {"tables": {}}}).status_code == 200


@pytest.mark.parametrize("raw,expected", [
    ("nextval('x_seq'::regclass)", (None, True)),
    ("'pending'::character varying", ("'pending'", False)),
    ("((0))", ("0", False)),
    ("now()", ("`now()`", False)),
    ("'it''s'", ("'it\\'s'", False)),
])
def test_default_values(raw, expected):
    assert default_str(raw) == expected


def test_identifiers_with_spaces_are_quoted():
    out = to_dbml({"tables": [{"schema": None, "name": "order items", "pk": ["line no"], "uniques": [], "indexes": [],
                               "comment": None, "columns": [{"name": "line no", "type": "INTEGER", "nullable": False}]}],
                   "refs": []})
    assert 'Table "order items" {' in out and '"line no" INTEGER [pk]' in out


def test_localhost_means_the_users_computer_in_docker(monkeypatch):
    from app import config
    from app.introspect import target_host
    monkeypatch.setattr(config, "IN_DOCKER", True)
    for h in ["localhost", "127.0.0.1", " LOCALHOST "]:
        assert target_host(h) == "host.docker.internal"
    assert target_host("db.company.local") == "db.company.local"
    monkeypatch.setattr(config, "IN_DOCKER", False)
    assert target_host("127.0.0.1") == "127.0.0.1"


def test_mysql_host_not_allowed_message():
    from app.introspect import _friendly
    from app.schemas import ConnectionRequest
    req = ConnectionRequest(engine="mysql", host="localhost", database="loans", username="root", password="pw")
    err = Exception("(1130, \"Host '172.18.0.5' is not allowed to connect to this MariaDB server\")")
    msg = _friendly(err, req)
    assert "CREATE USER 'fluix_reader'@'172.%'" in msg and "loans" in msg and "pw" not in msg
