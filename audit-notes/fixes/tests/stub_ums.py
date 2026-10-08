# ── NEW ── test helper only, not copied into src/
"""A stand-in for UMS (/api/v1/authenticate/<credentials>, /api/v1/verify_api_token) with
the same answers the real UMS AuthController gives. Python stdlib only.

Run:  python3 stub_ums.py 8001
"""
import base64
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote

FM = "SYS-222-FM"
USERS = {  # username -> (UMS users.id, user type id, type name, system)
    "owner": (1, 3, "System Owner", FM),
    "super": (2, 2, "Super User", FM),
    "regular": (3, 5, "Regular User", FM),
    "admin": (5, 13, "Administrator", FM),
    "atlas_owner": (6, 3, "System Owner", "SYS-005-ATLAS"),
    # For the ipc_centralized view checks (tests/ipc_view_fixture.sql):
    "inactive": (7, 3, "System Owner", FM),   # active here, inactive in the view
    "promoted": (8, 5, "Regular User", FM),   # Regular here, System Owner in the view
}
TOKENS: dict[str, str] = {}


def user_json(username: str, token: str) -> dict:
    uid, type_id, type_name, system = USERS[username]
    return {"id": uid, "username": username, "employeeNo": f"E{uid}", "fullName": f"{username.title()} User",
            "email": f"{username}@example.test", "apiToken": token,
            "accesses": [{"userTypeId": type_id, "userType": type_name, "systemReferenceCode": system}]}


class Handler(BaseHTTPRequestHandler):
    def send(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        prefix = "/api/v1/authenticate/"
        if not self.path.startswith(prefix):
            return self.send(404, {})
        try:
            creds = json.loads(unquote(base64.b64decode(unquote(self.path[len(prefix):])).decode()))
        except ValueError:
            return self.send(500, {"message": "Server Error"})
        username = creds.get("username")
        if username not in USERS:
            return self.send(422, {"errors": "The Provided credentials are not correct"})
        token = f"{USERS[username][0]}|stub-{username}-{len(TOKENS)}"
        TOKENS[token] = username
        self.send(200, {"user": user_json(username, token)})

    def do_POST(self):
        if self.path != "/api/v1/verify_api_token":
            return self.send(404, {})
        length = int(self.headers.get("Content-Length") or 0)
        form = parse_qs(self.rfile.read(length).decode())
        token = self.headers.get("Authorization", "").removeprefix("Bearer ")
        if token not in TOKENS or form.get("systemReferenceCode") != [FM]:
            return self.send(500, {"message": "Server Error"})
        self.send(200, {"user": user_json(TOKENS[token], token), "apiToken": token})

    def log_message(self, fmt, *args):
        sys.stderr.write("stub-ums: " + fmt % args + "\n")


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(sys.argv[1]) if len(sys.argv) > 1 else 8001), Handler).serve_forever()
