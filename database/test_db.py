"""Tests for db.py — run with: python test_db.py"""

import os
import tempfile
import unittest

from db import Database


class TestDatabase(unittest.TestCase):
    def setUp(self):
        fd, self.path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        self.db = Database(self.path)
        self.db.create_table(
            "users",
            {
                "id": "INTEGER PRIMARY KEY AUTOINCREMENT",
                "name": "TEXT NOT NULL",
                "email": "TEXT UNIQUE NOT NULL",
            },
        )

    def tearDown(self):
        self.db.close()
        os.remove(self.path)

    def test_create_table_is_idempotent(self):
        # Should not raise even though the table already exists from setUp.
        self.db.create_table(
            "users",
            {
                "id": "INTEGER PRIMARY KEY AUTOINCREMENT",
                "name": "TEXT NOT NULL",
                "email": "TEXT UNIQUE NOT NULL",
            },
        )

    def test_write_returns_row_id(self):
        row_id = self.db.write("users", {"name": "Ada", "email": "ada@example.com"})
        self.assertEqual(row_id, 1)
        row_id2 = self.db.write("users", {"name": "Grace", "email": "grace@example.com"})
        self.assertEqual(row_id2, 2)

    def test_read_all_rows(self):
        self.db.write("users", {"name": "Ada", "email": "ada@example.com"})
        self.db.write("users", {"name": "Grace", "email": "grace@example.com"})
        rows = self.db.read("users")
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["name"], "Ada")
        self.assertEqual(rows[1]["email"], "grace@example.com")

    def test_read_with_filter(self):
        self.db.write("users", {"name": "Ada", "email": "ada@example.com"})
        self.db.write("users", {"name": "Grace", "email": "grace@example.com"})
        rows = self.db.read("users", where={"name": "Grace"})
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["email"], "grace@example.com")

    def test_read_specific_columns(self):
        self.db.write("users", {"name": "Ada", "email": "ada@example.com"})
        rows = self.db.read("users", columns=["name"])
        self.assertEqual(rows, [{"name": "Ada"}])

    def test_search_matches_partial_text_case_insensitively(self):
        self.db.write("users", {"name": "Ada Lovelace", "email": "ada@example.com"})
        self.db.write("users", {"name": "Grace Hopper", "email": "grace@example.com"})
        rows = self.db.search("users", ["name"], "LOVE")
        self.assertEqual([r["name"] for r in rows], ["Ada Lovelace"])

    def test_search_matches_across_multiple_columns(self):
        self.db.write("users", {"name": "Ada Lovelace", "email": "ada@example.com"})
        self.db.write("users", {"name": "Grace Hopper", "email": "grace@example.com"})
        rows = self.db.search("users", ["name", "email"], "grace")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "Grace Hopper")

    def test_search_returns_empty_list_when_no_match(self):
        self.db.write("users", {"name": "Ada Lovelace", "email": "ada@example.com"})
        rows = self.db.search("users", ["name", "email"], "nonexistent")
        self.assertEqual(rows, [])

    def test_update(self):
        self.db.write("users", {"name": "Ada", "email": "ada@example.com"})
        affected = self.db.update("users", {"name": "Ada Lovelace"}, where={"email": "ada@example.com"})
        self.assertEqual(affected, 1)
        rows = self.db.read("users", where={"email": "ada@example.com"})
        self.assertEqual(rows[0]["name"], "Ada Lovelace")

    def test_delete(self):
        self.db.write("users", {"name": "Ada", "email": "ada@example.com"})
        affected = self.db.delete("users", where={"name": "Ada"})
        self.assertEqual(affected, 1)
        self.assertEqual(self.db.read("users"), [])

    def test_unique_constraint_raises(self):
        import sqlite3

        self.db.write("users", {"name": "Ada", "email": "ada@example.com"})
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.write("users", {"name": "Duplicate", "email": "ada@example.com"})

    def test_data_persists_after_reconnect(self):
        self.db.write("users", {"name": "Ada", "email": "ada@example.com"})
        self.db.close()
        db2 = Database(self.path)
        rows = db2.read("users")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "Ada")
        db2.close()

    def test_context_manager(self):
        with Database(self.path) as db:
            rows = db.read("users")
            self.assertEqual(rows, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
