#Login API built on top of db.py.
#
#Provides signup / login / logout / whoami as plain functions (easy to unit
#test) plus a thin stdlib HTTP layer (http.server) exposing them as JSON
#endpoints, so no third-party web framework is required.
#
#Endpoints:
#    POST /signup   {"username": ..., "email": ..., "password": ...}   -> 201
#    POST /login    {"email": ..., "password": ...}          -> 200 {"token": ...}
#    POST /logout   Authorization: Bearer <token>             -> 200
#    GET  /whoami   Authorization: Bearer <token>              -> 200 {"username": ..., "email": ...}
#
# claude also added some weird conventions like leading unders to prevent getting called or smthn somewhere else
import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from db import Database

SESSION_LIFETIME = timedelta(hours=24)
PBKDF2_ITERATIONS = 200_000


class AuthError(Exception):

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_db(db: Database) -> None:
    """Create the tables the login API needs, if they don't already exist.""" # yay
    db.create_table(
        "users",
        {
            "id": "INTEGER PRIMARY KEY AUTOINCREMENT",
            "username": "TEXT UNIQUE NOT NULL",
            "email": "TEXT UNIQUE NOT NULL",
            "password_hash": "TEXT NOT NULL",
            "created_at": "TEXT NOT NULL",
        }
    )
    db.create_table(
        "sessions",
        {
            "id": "INTEGER PRIMARY KEY AUTOINCREMENT",
            "user_id": "INTEGER NOT NULL",
            "token": "TEXT UNIQUE NOT NULL",
            "created_at": "TEXT NOT NULL",
            "expires_at": "TEXT NOT NULL",
        },
    )


def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"{salt.hex()}${digest.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    salt_hex, _, _ = stored.partition("$")
    salt = bytes.fromhex(salt_hex)
    return secrets.compare_digest(_hash_password(password, salt), stored)

# yes i know redundant logic, but its gooderer fr
def signup(db: Database, username: str, email: str, password: str) -> int:
# Create a new user and returns the new user's id
    username = username.strip()
    email = email.strip().lower()
    if not username:
        raise AuthError("Username cannot be empty", 400)
    if not email or "@" not in email:
        raise AuthError("Invalid email address", 400)
    if not password or len(password) < 8:
        raise AuthError("Password must be at least 8 characters", 400)
    if db.read("users", where={"username": username}):
        raise AuthError("Username already taken", 409)
    if db.read("users", where={"email": email}):
        raise AuthError("Email already registered", 409)
    return db.write(
        "users",
        {
            "username": username,
            "email": email,
            "password_hash": _hash_password(password),
            "created_at": _now(),
        },
    )


def login(db: Database, email: str, password: str) -> str:
# Verify credentials and create a session and returns a token i guess
    email = email.strip().lower()
    rows = db.read("users", where={"email": email})
    if not rows or not _verify_password(password, rows[0]["password_hash"]):
        raise AuthError("Invalid email or password", 401)

    user_id = rows[0]["id"]
    db.delete("sessions", where={"user_id": user_id})  # only one active session per user

    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    db.write(
        "sessions",
        {
            "user_id": user_id,
            "token": token,
            "created_at": now.isoformat(),
            "expires_at": (now + SESSION_LIFETIME).isoformat(),
        },
    )
    return token


def _get_valid_session(db: Database, token: str) -> dict:
    rows = db.read("sessions", where={"token": token})
    if not rows:
        raise AuthError("Invalid or expired session", 401)
    session = rows[0]
    expires_at = datetime.fromisoformat(session["expires_at"])
    if expires_at < datetime.now(timezone.utc):
        db.delete("sessions", where={"token": token})
        raise AuthError("Invalid or expired session", 401)
    return session


def whoami(db: Database, token: str) -> dict:
 #return the user record for a valid session token
    session = _get_valid_session(db, token)
    rows = db.read("users", where={"id": session["user_id"]})
    if not rows:
        raise AuthError("Invalid or expired session", 401)
    user = rows[0]
    return {"id": user["id"], "username": user["username"], "email": user["email"]}


def logout(db: Database, token: str) -> None:
# murder the old token so you dont automatically log back in
    db.delete("sessions", where={"token": token})


# --------------------------------------------------------------------------
# HTTP layer
# --------------------------------------------------------------------------

def _make_handler(db_path: str):
    class Handler(BaseHTTPRequestHandler):
        def _send_json(self, status: int, payload: dict) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _read_json_body(self) -> dict:
            length = int(self.headers.get("Content-Length", 0))
            if length == 0:
                return {}
            raw = self.rfile.read(length)
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                raise AuthError("Malformed JSON body", 400)

        def _bearer_token(self) -> str:
            header = self.headers.get("Authorization", "")
            if not header.startswith("Bearer "):
                raise AuthError("Missing bearer token", 401)
            return header[len("Bearer "):].strip()

        def do_POST(self):
            db = Database(db_path)
            try:
                body = self._read_json_body()
                if self.path == "/signup":
                    user_id = signup(db, body.get("username", ""), body.get("email", ""), body.get("password", ""))
                    self._send_json(201, {"id": user_id})
                elif self.path == "/login":
                    token = login(db, body.get("email", ""), body.get("password", ""))
                    self._send_json(200, {"token": token})
                elif self.path == "/logout":
                    logout(db, self._bearer_token())
                    self._send_json(200, {"ok": True})
                else:
                    self._send_json(404, {"error": "Not found"})
            except AuthError as e:
                self._send_json(e.status, {"error": e.message})
            finally:
                db.close()

        def do_GET(self):
            db = Database(db_path)
            try:
                if self.path == "/whoami":
                    self._send_json(200, whoami(db, self._bearer_token()))
                else:
                    self._send_json(404, {"error": "Not found"})
            except AuthError as e:
                self._send_json(e.status, {"error": e.message})
            finally:
                db.close()

        def log_message(self, format, *args):
            pass  # silence default request logging

    return Handler


def run_server(db_path: str = "app.db", port: int = 8000) -> ThreadingHTTPServer:
    with Database(db_path) as db:
        init_db(db)
    server = ThreadingHTTPServer(("127.0.0.1", port), _make_handler(db_path))
    return server


if __name__ == "__main__":
    server = run_server()
    print(f"Login API listening on http://127.0.0.1:{server.server_port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
