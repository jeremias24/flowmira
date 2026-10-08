"""flowmira-erd settings, all from environment variables."""
import os


def _list(name: str) -> list[str]:
    return [v.strip() for v in os.getenv(name, "").split(",") if v.strip()]


# Flowmira's own database: stores ERD documents (never the databases you inspect).
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./fluix_erd.db")

CORS_ORIGINS = _list("CORS_ORIGINS") or ["http://localhost:5173", "http://127.0.0.1:5173"]

# Which database servers may be inspected. Empty = any host the server can reach,
# EXCEPT cloud metadata / link-local addresses (always blocked).
# Entries: exact host ("db.company.local"), wildcard ("*.company.local"), or CIDR ("10.0.0.0/8").
ALLOWED_HOSTS = _list("ERD_ALLOWED_HOSTS")

# SQLite files on the server: only for tests/demos, never in production.
ALLOW_SQLITE = os.getenv("ERD_ALLOW_SQLITE", "") == "1"

MAX_TABLES = int(os.getenv("ERD_MAX_TABLES", "400"))
CONNECT_TIMEOUT = int(os.getenv("ERD_CONNECT_TIMEOUT", "10"))

# Running inside Docker? Then "localhost" in a connection form means the user's computer,
# which the container reaches as host.docker.internal (see extra_hosts in docker-compose.yml).
IN_DOCKER = os.getenv("ERD_IN_DOCKER", "") == "1" or os.path.exists("/.dockerenv")
DOCKER_HOST_ALIAS = os.getenv("ERD_DOCKER_HOST_ALIAS", "host.docker.internal")
