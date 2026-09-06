"""Tests for conversation_api.py. Run with: python test_conversation_api.py"""

import base64
import json
import os
import shutil
import sqlite3
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

import conversation_api
import login_api
from db import Database


class TestConversationLogic(unittest.TestCase):
    """Tests against the plain functions, bypassing HTTP entirely."""

    def setUp(self):
        fd, self.path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        self.db = Database(self.path)
        conversation_api.init_db(self.db)
        self.user_id = login_api.signup(self.db, "ada", "ada@example.com", "password123")
        conversation_api.MEDIA_ROOT = Path(tempfile.mkdtemp(prefix="conv_media_"))

    def tearDown(self):
        self.db.close()
        os.remove(self.path)
        shutil.rmtree(conversation_api.MEDIA_ROOT, ignore_errors=True)

    def test_create_conversation_creates_row_and_transcript_file(self):
        conversation_id = conversation_api.create_conversation(self.db, self.user_id)
        row = conversation_api.get_conversation(self.db, conversation_id)
        self.assertEqual(row["user_id"], self.user_id)
        self.assertEqual(row["cost"], 0.0)
        self.assertIsNotNone(row["creation_date"])
        transcript_path = Path(row["conversation"])
        self.assertTrue(transcript_path.exists())
        self.assertEqual(transcript_path.read_text(encoding="utf-8"), "")

    def test_create_conversation_rejects_unknown_user(self):
        with self.assertRaises(login_api.AuthError) as ctx:
            conversation_api.create_conversation(self.db, 999999)
        self.assertEqual(ctx.exception.status, 404)

    def test_add_prompt_creates_row_and_appends_transcript(self):
        conversation_id = conversation_api.create_conversation(self.db, self.user_id)
        prompt_id = conversation_api.add_prompt(self.db, conversation_id, "Hello AI")
        rows = self.db.read("prompts", where={"prompt_id": prompt_id})
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["content"], "Hello AI")
        self.assertIsNone(rows[0]["response"])
        self.assertIsNone(rows[0]["input_media"])

        transcript = Path(conversation_api.get_conversation(self.db, conversation_id)["conversation"])
        self.assertIn("USER: Hello AI", transcript.read_text(encoding="utf-8"))

    def test_add_prompt_rejects_empty_content(self):
        conversation_id = conversation_api.create_conversation(self.db, self.user_id)
        with self.assertRaises(login_api.AuthError) as ctx:
            conversation_api.add_prompt(self.db, conversation_id, "")
        self.assertEqual(ctx.exception.status, 400)

    def test_add_prompt_rejects_unknown_conversation(self):
        with self.assertRaises(login_api.AuthError) as ctx:
            conversation_api.add_prompt(self.db, 999999, "Hello")
        self.assertEqual(ctx.exception.status, 404)

    def test_add_prompt_saves_input_media_and_sanitizes_filename(self):
        conversation_id = conversation_api.create_conversation(self.db, self.user_id)
        data = base64.b64encode(b"raw file bytes").decode("ascii")
        prompt_id = conversation_api.add_prompt(
            self.db, conversation_id, "See attached",
            input_media_filename="../../evil.txt", input_media_base64=data,
        )
        rows = self.db.read("prompts", where={"prompt_id": prompt_id})
        media_path = Path(rows[0]["input_media"])
        self.assertTrue(media_path.exists())
        self.assertEqual(media_path.read_bytes(), b"raw file bytes")
        # Must stay inside MEDIA_ROOT -- no path traversal from the caller-supplied filename.
        self.assertIn(conversation_api.MEDIA_ROOT.resolve(), media_path.resolve().parents)
        self.assertNotIn("..", media_path.parts)

    def test_add_response_updates_prompt_and_accumulates_cost(self):
        conversation_id = conversation_api.create_conversation(self.db, self.user_id)
        prompt_id_1 = conversation_api.add_prompt(self.db, conversation_id, "Question one")
        conversation_api.add_response(self.db, prompt_id_1, "Answer one", cost=0.05)
        prompt_id_2 = conversation_api.add_prompt(self.db, conversation_id, "Question two")
        conversation_api.add_response(self.db, prompt_id_2, "Answer two", cost=0.02)

        row1 = self.db.read("prompts", where={"prompt_id": prompt_id_1})[0]
        self.assertEqual(row1["response"], "Answer one")

        conversation = conversation_api.get_conversation(self.db, conversation_id)
        self.assertAlmostEqual(conversation["cost"], 0.07)

        transcript = Path(conversation["conversation"]).read_text(encoding="utf-8")
        self.assertIn("AI: Answer one", transcript)
        self.assertIn("AI: Answer two", transcript)

    def test_add_response_rejects_unknown_prompt(self):
        with self.assertRaises(login_api.AuthError) as ctx:
            conversation_api.add_response(self.db, 999999, "Answer")
        self.assertEqual(ctx.exception.status, 404)

    def test_add_response_rejects_empty_response(self):
        conversation_id = conversation_api.create_conversation(self.db, self.user_id)
        prompt_id = conversation_api.add_prompt(self.db, conversation_id, "Question")
        with self.assertRaises(login_api.AuthError) as ctx:
            conversation_api.add_response(self.db, prompt_id, "")
        self.assertEqual(ctx.exception.status, 400)

    def test_get_conversation_not_found(self):
        with self.assertRaises(login_api.AuthError) as ctx:
            conversation_api.get_conversation(self.db, 999999)
        self.assertEqual(ctx.exception.status, 404)

    def test_get_prompts_ordered_by_time(self):
        conversation_id = conversation_api.create_conversation(self.db, self.user_id)
        conversation_api.add_prompt(self.db, conversation_id, "first")
        conversation_api.add_prompt(self.db, conversation_id, "second")
        conversation_api.add_prompt(self.db, conversation_id, "third")
        prompts = conversation_api.get_prompts(self.db, conversation_id)
        self.assertEqual([p["content"] for p in prompts], ["first", "second", "third"])

    def test_list_conversations_scoped_to_user(self):
        other_user_id = login_api.signup(self.db, "grace", "grace@example.com", "password123")
        conv_a = conversation_api.create_conversation(self.db, self.user_id)
        conv_b = conversation_api.create_conversation(self.db, self.user_id)
        conversation_api.create_conversation(self.db, other_user_id)

        conversations = conversation_api.list_conversations(self.db, self.user_id)
        ids = {c["conversation_id"] for c in conversations}
        self.assertEqual(ids, {conv_a, conv_b})

    def test_foreign_key_enforced_at_db_level(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.write(
                "prompts",
                {
                    "conversation_id": 999999,
                    "prompt_time": "now",
                    "content": "orphaned prompt",
                    "response": None,
                    "input_media": None,
                    "output_media": None,
                },
            )


class TestConversationHttpApi(unittest.TestCase):
    """End-to-end tests against the real HTTP server."""

    @classmethod
    def setUpClass(cls):
        fd, cls.db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        cls.media_root = Path(tempfile.mkdtemp(prefix="conv_media_http_"))
        conversation_api.MEDIA_ROOT = cls.media_root

        with Database(cls.db_path) as db:
            conversation_api.init_db(db)
            cls.user_id = login_api.signup(db, "http_user", "http_user@example.com", "password123")
            cls.token = login_api.login(db, "http_user@example.com", "password123")
            cls.other_user_id = login_api.signup(db, "other_user", "other_user@example.com", "password123")
            cls.other_token = login_api.login(db, "other_user@example.com", "password123")

        cls.server = conversation_api.run_server(db_path=cls.db_path, port=0)
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)
        os.remove(cls.db_path)
        shutil.rmtree(cls.media_root, ignore_errors=True)

    def _request(self, method, path, body=None, token=None):
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(self.base_url + path, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(req) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as e:
            with e:
                return e.code, json.loads(e.read())

    def test_full_conversation_flow(self):
        status, body = self._request("POST", "/conversations", token=self.token)
        self.assertEqual(status, 201)
        conversation_id = body["conversation_id"]

        status, body = self._request(
            "POST", f"/conversations/{conversation_id}/prompts",
            {"content": "Hello there"}, token=self.token,
        )
        self.assertEqual(status, 201)
        prompt_id = body["prompt_id"]

        status, body = self._request(
            "POST", f"/prompts/{prompt_id}/response",
            {"response": "General Kenobi", "cost": 0.04}, token=self.token,
        )
        self.assertEqual(status, 200)

        status, body = self._request("GET", f"/conversations/{conversation_id}", token=self.token)
        self.assertEqual(status, 200)
        self.assertAlmostEqual(body["cost"], 0.04)

        status, body = self._request("GET", f"/conversations/{conversation_id}/prompts", token=self.token)
        self.assertEqual(status, 200)
        self.assertEqual(len(body), 1)
        self.assertEqual(body[0]["content"], "Hello there")
        self.assertEqual(body[0]["response"], "General Kenobi")

        status, body = self._request("GET", "/conversations", token=self.token)
        self.assertEqual(status, 200)
        self.assertTrue(any(c["conversation_id"] == conversation_id for c in body))

    def test_requires_authentication(self):
        status, body = self._request("GET", "/conversations")
        self.assertEqual(status, 401)

    def test_cannot_access_another_users_conversation(self):
        status, body = self._request("POST", "/conversations", token=self.token)
        conversation_id = body["conversation_id"]

        status, body = self._request("GET", f"/conversations/{conversation_id}", token=self.other_token)
        self.assertEqual(status, 404)

    def test_prompt_with_base64_media_round_trips(self):
        status, body = self._request("POST", "/conversations", token=self.token)
        conversation_id = body["conversation_id"]

        payload = base64.b64encode(b"hello from a file").decode("ascii")
        status, body = self._request(
            "POST", f"/conversations/{conversation_id}/prompts",
            {"content": "here's a file", "input_media_filename": "note.txt", "input_media_base64": payload},
            token=self.token,
        )
        self.assertEqual(status, 201)

        status, body = self._request("GET", f"/conversations/{conversation_id}/prompts", token=self.token)
        media_path = body[0]["input_media"]
        self.assertIsNotNone(media_path)
        self.assertEqual(Path(media_path).read_bytes(), b"hello from a file")


if __name__ == "__main__":
    unittest.main(verbosity=2)
