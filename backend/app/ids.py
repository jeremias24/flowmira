# ── NEW ── whole file (the same file is in erd/app/ids.py)
"""Encrypted ids for addresses: /flowmira/diagram/<ref> instead of /flowmira/diagram/4.

AES-SIV (authenticated, deterministic): the same id always gives the same ref, so bookmarks keep
working; a ref can't be read, guessed or altered without the key; and the kind ("diagram", "erd")
is bound in, so a diagram's ref doesn't open an ERD. Access checks are unchanged: a ref only
saves a lookup, the user must still be allowed to see the diagram.

The key is FLOWMIRA_ID_KEY in .env: 64 random bytes, base64url. Make one with
    python -c "import base64, os; print(base64.urlsafe_b64encode(os.urandom(64)).decode())"
The backend and the ERD service must use the same key. Changing it changes every address
(old bookmarks stop working; nothing else is affected).
"""
import base64
import binascii
import logging
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESSIV

log = logging.getLogger(__name__)


def _load_key() -> bytes:
    raw = os.getenv("FLOWMIRA_ID_KEY", "").strip()
    if not raw:
        # Development and tests only; docker-compose.prod.yml requires the variable.
        log.warning("FLOWMIRA_ID_KEY is not set: using a temporary key, addresses change on restart")
        return os.urandom(64)
    try:
        key = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))
    except (binascii.Error, ValueError) as e:
        raise RuntimeError("FLOWMIRA_ID_KEY must be base64url") from e
    if len(key) not in (32, 48, 64):
        raise RuntimeError("FLOWMIRA_ID_KEY must be 32, 48 or 64 bytes (64 recommended)")
    return key


_siv = AESSIV(_load_key())


def encode_id(kind: str, value: int) -> str:
    """32-character ref for an id."""
    token = _siv.encrypt(value.to_bytes(8, "big"), [kind.encode()])
    return base64.urlsafe_b64encode(token).rstrip(b"=").decode()


def decode_id(kind: str, ref: str) -> int | None:
    """The id behind a ref, or None if it isn't a valid ref of this kind."""
    if not ref or len(ref) > 64:
        return None
    try:
        token = base64.urlsafe_b64decode(ref + "=" * (-len(ref) % 4))
        return int.from_bytes(_siv.decrypt(token, [kind.encode()]), "big")
    except (InvalidTag, binascii.Error, ValueError):
        return None
