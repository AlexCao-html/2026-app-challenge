"""Conversation API built on top of db.py and login_api.py.

Stores AI conversations and their individual prompt/response exchanges.
Reuses login_api.py for authentication (every conversation belongs to a
logged-in user, resolved from the same bearer token used by login_api) and
db.py for all SQLite access.

Large content -- the running conversation transcript and any attached
media -- is written to files under conversation_files/, with only the file
path stored in the database. Two tables are created:

    conversation: conversation_id, user_id, conversation (path to .txt
                  transcript), creation_date, cost
    prompts:      prompt_id, conversation_id, prompt_time, content,
                  response, input_media (path to file), output_media
                  (path to file)

Endpoints:
    POST /conversations                       -> 201 {"conversation_id": ...}
    GET  /conversations                        -> 200 [conversation, ...]
    GET  /conversations/<id>                   -> 200 {conversation}
    GET  /conversations/<id>/prompts           -> 200 [prompt, ...]
    POST /conversations/<id>/prompts           -> 201 {"prompt_id": ...}
    POST /prompts/<id>/response                -> 200 {"ok": true}
All endpoints require Authorization: Bearer <token> from login_api's /login.
"""

import base64
import json
import re
import secrets
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import login_api
from db import Database

MEDIA_ROOT = Path("conversation_files")

_ROUTE_CONVERSATION = re.compile(r"^/conversations/(\d+)$")
_ROUTE_CONVERSATION_PROMPTS = re.compile(r"^/conversations/(\d+)/prompts$")
_ROUTE_PROMPT_RESPONSE = re.compile(r"^/prompts/(\d+)/response$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _conversation_dir(conversation_id: int) -> Path:
    directory = MEDIA_ROOT / str(conversation_id)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _transcript_path(conversation_id: int) -> Path:
    return _conversation_dir(conversation_id) / "transcript.txt"


def _append_transcript(conversation_id: int, line: str) -> None:
    with _transcript_path(conversation_id).open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def _save_media(conversation_id: int, filename: str, base64_data: str) -> str:
    """Decode base64 file data and save it under this conversation's media folder.

    Only the base filename (never any directory components) is used, so a
    caller-supplied name like "../../evil.txt" can't write outside of
    conversation_files/.
    """
    safe_name = f"{secrets.token_hex(4)}_{Path(filename).name}"
    directory = _conversation_dir(conversation_id) / "media"
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / safe_name
    path.write_bytes(base64.b64decode(base64_data))
    return str(path)


def init_db(db: Database) -> None:
    """Create the tables this API needs (and the users/sessions tables it depends on)."""
    login_api.init_db(db)
    db.create_table(
        "conversation",
        {
            "conversation_id": "INTEGER PRIMARY KEY AUTOINCREMENT",
            "user_id": "INTEGER NOT NULL REFERENCES users(id)",
            "conversation": "TEXT",
            "creation_date": "TEXT NOT NULL",
            "cost": "REAL NOT NULL DEFAULT 0",
        },
    )
    db.create_table(
        "prompts",
        {
            "prompt_id": "INTEGER PRIMARY KEY AUTOINCREMENT",
            "conversation_id": "INTEGER NOT NULL REFERENCES conversation(conversation_id)",
            "prompt_time": "TEXT NOT NULL",
            "content": "TEXT NOT NULL",
            "response": "TEXT",
            "input_media": "TEXT",
            "output_media": "TEXT",
        },
    )


def create_conversation(db: Database, user_id: int) -> int:
    """Start a new conversation for a user and return its conversation_id."""
    if not db.read("users", where={"id": user_id}):
        raise login_api.AuthError("User not found", 404)

    conversation_id = db.write(
        "conversation",
        {
            "user_id": user_id,
            "conversation": None,
            "creation_date": _now(),
            "cost": 0.0,
        },
    )
    transcript = _transcript_path(conversation_id)
    transcript.write_text("", encoding="utf-8")
    db.update(
        "conversation",
        {"conversation": str(transcript)},
        where={"conversation_id": conversation_id},
    )
    return conversation_id


def add_prompt(
    db: Database,
    conversation_id: int,
    content: str,
    input_media_filename: str | None = None,
    input_media_base64: str | None = None,
) -> int:
    """Record a user prompt on a conversation. Returns the new prompt_id."""
    if not content:
        raise login_api.AuthError("Prompt content cannot be empty", 400)
    if not db.read("conversation", where={"conversation_id": conversation_id}):
        raise login_api.AuthError("Conversation not found", 404)

    input_media_path = None
    if input_media_base64:
        input_media_path = _save_media(conversation_id, input_media_filename or "input", input_media_base64)

    prompt_id = db.write(
        "prompts",
        {
            "conversation_id": conversation_id,
            "prompt_time": _now(),
            "content": content,
            "response": None,
            "input_media": input_media_path,
            "output_media": None,
        },
    )
    _append_transcript(conversation_id, f"[{_now()}] USER: {content}")
    return prompt_id


def add_response(
    db: Database,
    prompt_id: int,
    response_text: str,
    output_media_filename: str | None = None,
    output_media_base64: str | None = None,
    cost: float = 0.0,
) -> None:
    """Attach the AI's response to an existing prompt and add its cost to the conversation total."""
    if not response_text:
        raise login_api.AuthError("Response content cannot be empty", 400)
    rows = db.read("prompts", where={"prompt_id": prompt_id})
    if not rows:
        raise login_api.AuthError("Prompt not found", 404)
    conversation_id = rows[0]["conversation_id"]

    output_media_path = None
    if output_media_base64:
        output_media_path = _save_media(conversation_id, output_media_filename or "output", output_media_base64)

    db.update(
        "prompts",
        {"response": response_text, "output_media": output_media_path},
        where={"prompt_id": prompt_id},
    )
    _append_transcript(conversation_id, f"[{_now()}] AI: {response_text}")

    conversation = db.read("conversation", where={"conversation_id": conversation_id})[0]
    db.update(
        "conversation",
        {"cost": conversation["cost"] + cost},
        where={"conversation_id": conversation_id},
    )


def get_conversation(db: Database, conversation_id: int) -> dict:
    rows = db.read("conversation", where={"conversation_id": conversation_id})
    if not rows:
        raise login_api.AuthError("Conversation not found", 404)
    return rows[0]


def get_prompts(db: Database, conversation_id: int) -> list[dict]:
    rows = db.read("prompts", where={"conversation_id": conversation_id})
    return sorted(rows, key=lambda row: row["prompt_time"])


def list_conversations(db: Database, user_id: int) -> list[dict]:
    rows = db.read("conversation", where={"user_id": user_id})
    return sorted(rows, key=lambda row: row["creation_date"])


# --------------------------------------------------------------------------
# HTTP layer
# --------------------------------------------------------------------------

def _make_handler(db_path: str):
    class Handler(BaseHTTPRequestHandler):
        def _send_json(self, status: int, payload) -> None:
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
                raise login_api.AuthError("Malformed JSON body", 400)

        def _authenticated_user_id(self, db: Database) -> int:
            header = self.headers.get("Authorization", "")
            if not header.startswith("Bearer "):
                raise login_api.AuthError("Missing bearer token", 401)
            token = header[len("Bearer "):].strip()
            return login_api.whoami(db, token)["id"]

        def _owned_conversation(self, db: Database, conversation_id: int, user_id: int) -> dict:
            conversation = get_conversation(db, conversation_id)
            if conversation["user_id"] != user_id:
                # 404 rather than 403 so we don't reveal that the id exists.
                raise login_api.AuthError("Conversation not found", 404)
            return conversation

        def do_GET(self):
            db = Database(db_path)
            try:
                user_id = self._authenticated_user_id(db)

                if self.path == "/conversations":
                    self._send_json(200, list_conversations(db, user_id))
                    return

                match = _ROUTE_CONVERSATION_PROMPTS.match(self.path)
                if match:
                    conversation_id = int(match.group(1))
                    self._owned_conversation(db, conversation_id, user_id)
                    self._send_json(200, get_prompts(db, conversation_id))
                    return

                match = _ROUTE_CONVERSATION.match(self.path)
                if match:
                    conversation_id = int(match.group(1))
                    conversation = self._owned_conversation(db, conversation_id, user_id)
                    self._send_json(200, conversation)
                    return

                self._send_json(404, {"error": "Not found"})
            except login_api.AuthError as e:
                self._send_json(e.status, {"error": e.message})
            finally:
                db.close()

        def do_POST(self):
            db = Database(db_path)
            try:
                user_id = self._authenticated_user_id(db)

                if self.path == "/conversations":
                    conversation_id = create_conversation(db, user_id)
                    self._send_json(201, {"conversation_id": conversation_id})
                    return

                match = _ROUTE_CONVERSATION_PROMPTS.match(self.path)
                if match:
                    conversation_id = int(match.group(1))
                    self._owned_conversation(db, conversation_id, user_id)
                    body = self._read_json_body()
                    prompt_id = add_prompt(
                        db,
                        conversation_id,
                        body.get("content", ""),
                        input_media_filename=body.get("input_media_filename"),
                        input_media_base64=body.get("input_media_base64"),
                    )
                    self._send_json(201, {"prompt_id": prompt_id})
                    return

                match = _ROUTE_PROMPT_RESPONSE.match(self.path)
                if match:
                    prompt_id = int(match.group(1))
                    prompt_rows = db.read("prompts", where={"prompt_id": prompt_id})
                    if not prompt_rows:
                        raise login_api.AuthError("Prompt not found", 404)
                    self._owned_conversation(db, prompt_rows[0]["conversation_id"], user_id)
                    body = self._read_json_body()
                    add_response(
                        db,
                        prompt_id,
                        body.get("response", ""),
                        output_media_filename=body.get("output_media_filename"),
                        output_media_base64=body.get("output_media_base64"),
                        cost=body.get("cost", 0.0),
                    )
                    self._send_json(200, {"ok": True})
                    return

                self._send_json(404, {"error": "Not found"})
            except login_api.AuthError as e:
                self._send_json(e.status, {"error": e.message})
            finally:
                db.close()

        def log_message(self, format, *args):
            pass  # silence default request logging

    return Handler


def run_server(db_path: str = "app.db", port: int = 8001) -> ThreadingHTTPServer:
    with Database(db_path) as db:
        init_db(db)
    server = ThreadingHTTPServer(("127.0.0.1", port), _make_handler(db_path))
    return server


if __name__ == "__main__":
    server = run_server()
    print(f"Conversation API listening on http://127.0.0.1:{server.server_port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
