"""Tests for "login_api.py". Run with: python test_login_api.py

The module filename contains a space (not a valid identifier), so it's
loaded dynamically via importlib instead of a normal `import` statement.
"""

import importlib.util
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent

spec = importlib.util.spec_from_file_location("login_api", HERE / "login_api.py")
login_api = importlib.util.module_from_spec(spec)
sys.modules["login_api"] = login_api
spec.loader.exec_module(login_api)

from db import Database  # noqa: E402


class TestAuthLogic(unittest.TestCase):
    """Tests against the plain functions, bypassing HTTP entirely."""

    def setUp(self):
        fd, self.path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        self.db = Database(self.path)
        login_api.init_db(self.db)

    def tearDown(self):
        self.db.close()
        os.remove(self.path)

    def test_signup_creates_user(self):
        user_id = login_api.signup(self.db, "ada", "Ada@Example.com", "password123")
        self.assertEqual(user_id, 1)
        rows = self.db.read("users", where={"email": "ada@example.com"})
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["username"], "ada")
        self.assertNotEqual(rows[0]["password_hash"], "password123")  # not stored in plaintext

    def test_signup_rejects_duplicate_email(self):
        login_api.signup(self.db, "ada", "ada@example.com", "password123")
        with self.assertRaises(login_api.AuthError) as ctx:
            login_api.signup(self.db, "ada2", "ada@example.com", "otherpassword")
        self.assertEqual(ctx.exception.status, 409)

    def test_signup_rejects_duplicate_username(self):
        login_api.signup(self.db, "ada", "ada@example.com", "password123")
        with self.assertRaises(login_api.AuthError) as ctx:
            login_api.signup(self.db, "ada", "ada2@example.com", "otherpassword")
        self.assertEqual(ctx.exception.status, 409)

    def test_signup_rejects_empty_username(self):
        with self.assertRaises(login_api.AuthError) as ctx:
            login_api.signup(self.db, "   ", "ada@example.com", "password123")
        self.assertEqual(ctx.exception.status, 400)

    def test_signup_rejects_short_password(self):
        with self.assertRaises(login_api.AuthError) as ctx:
            login_api.signup(self.db, "ada", "ada@example.com", "short")
        self.assertEqual(ctx.exception.status, 400)

    def test_signup_rejects_invalid_email(self):
        with self.assertRaises(login_api.AuthError) as ctx:
            login_api.signup(self.db, "ada", "not-an-email", "password123")
        self.assertEqual(ctx.exception.status, 400)

    def test_login_success_returns_token(self):
        login_api.signup(self.db, "ada", "ada@example.com", "password123")
        token = login_api.login(self.db, "ada@example.com", "password123")
        self.assertIsInstance(token, str)
        self.assertGreater(len(token), 20)

    def test_login_rejects_wrong_password(self):
        login_api.signup(self.db, "ada", "ada@example.com", "password123")
        with self.assertRaises(login_api.AuthError) as ctx:
            login_api.login(self.db, "ada@example.com", "wrongpassword")
        self.assertEqual(ctx.exception.status, 401)

    def test_login_rejects_unknown_email(self):
        with self.assertRaises(login_api.AuthError) as ctx:
            login_api.login(self.db, "ghost@example.com", "password123")
        self.assertEqual(ctx.exception.status, 401)

    def test_login_invalidates_previous_session(self):
        login_api.signup(self.db, "ada", "ada@example.com", "password123")
        old_token = login_api.login(self.db, "ada@example.com", "password123")
        new_token = login_api.login(self.db, "ada@example.com", "password123")

        self.assertNotEqual(old_token, new_token)
        with self.assertRaises(login_api.AuthError) as ctx:
            login_api.whoami(self.db, old_token)
        self.assertEqual(ctx.exception.status, 401)
        self.assertEqual(login_api.whoami(self.db, new_token)["email"], "ada@example.com")

    def test_whoami_returns_user_for_valid_token(self):
        login_api.signup(self.db, "ada", "ada@example.com", "password123")
        token = login_api.login(self.db, "ada@example.com", "password123")
        result = login_api.whoami(self.db, token)
        self.assertEqual(result["username"], "ada")
        self.assertEqual(result["email"], "ada@example.com")

    def test_whoami_rejects_bad_token(self):
        with self.assertRaises(login_api.AuthError) as ctx:
            login_api.whoami(self.db, "not-a-real-token")
        self.assertEqual(ctx.exception.status, 401)

    def test_logout_invalidates_token(self):
        login_api.signup(self.db, "ada", "ada@example.com", "password123")
        token = login_api.login(self.db, "ada@example.com", "password123")
        login_api.logout(self.db, token)
        with self.assertRaises(login_api.AuthError):
            login_api.whoami(self.db, token)

    def test_expired_session_is_rejected(self):
        from datetime import datetime, timedelta, timezone

        login_api.signup(self.db, "ada", "ada@example.com", "password123")
        token = login_api.login(self.db, "ada@example.com", "password123")
        # Force the session into the past.
        expired = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        self.db.update("sessions", {"expires_at": expired}, where={"token": token})
        with self.assertRaises(login_api.AuthError) as ctx:
            login_api.whoami(self.db, token)
        self.assertEqual(ctx.exception.status, 401)


class TestHttpApi(unittest.TestCase):
    """End-to-end tests against the real HTTP server."""

    @classmethod
    def setUpClass(cls):
        fd, cls.db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        cls.server = login_api.run_server(db_path=cls.db_path, port=0)
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)
        os.remove(cls.db_path)

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

    def test_full_signup_login_whoami_logout_flow(self):
        status, body = self._request(
            "POST", "/signup", {"username": "grace", "email": "grace@example.com", "password": "password123"}
        )
        self.assertEqual(status, 201)
        self.assertIn("id", body)

        status, body = self._request("POST", "/login", {"email": "grace@example.com", "password": "password123"})
        self.assertEqual(status, 200)
        token = body["token"]

        status, body = self._request("GET", "/whoami", token=token)
        self.assertEqual(status, 200)
        self.assertEqual(body["username"], "grace")
        self.assertEqual(body["email"], "grace@example.com")

        status, body = self._request("POST", "/logout", token=token)
        self.assertEqual(status, 200)

        status, body = self._request("GET", "/whoami", token=token)
        self.assertEqual(status, 401)

    def test_duplicate_signup_returns_409(self):
        self._request("POST", "/signup", {"username": "dup", "email": "dup@example.com", "password": "password123"})
        status, body = self._request(
            "POST", "/signup", {"username": "dup2", "email": "dup@example.com", "password": "password123"}
        )
        self.assertEqual(status, 409)

    def test_duplicate_username_returns_409(self):
        self._request("POST", "/signup", {"username": "sameuser", "email": "one@example.com", "password": "password123"})
        status, body = self._request(
            "POST", "/signup", {"username": "sameuser", "email": "two@example.com", "password": "password123"}
        )
        self.assertEqual(status, 409)

    def test_login_wrong_password_returns_401(self):
        self._request("POST", "/signup", {"username": "bob", "email": "bob@example.com", "password": "password123"})
        status, body = self._request("POST", "/login", {"email": "bob@example.com", "password": "nope12345"})
        self.assertEqual(status, 401)

    def test_whoami_without_token_returns_401(self):
        status, body = self._request("GET", "/whoami")
        self.assertEqual(status, 401)

    def test_unknown_route_returns_404(self):
        status, body = self._request("GET", "/does-not-exist")
        self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main(verbosity=2)
