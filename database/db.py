"""Simple SQLite database helper with create, write, and read operations."""

import sqlite3
from pathlib import Path
from typing import Any, Iterable, Optional


class Database:
    def __init__(self, db_path: str = "app.db"):
        self.db_path = db_path
        self.conn = sqlite3.connect(self.db_path)
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.conn.row_factory = sqlite3.Row

    def create_table(self, table_name: str, columns: dict[str, str]) -> None:
        """Create a table if it doesn't already exist.

        columns: mapping of column name -> SQL type/constraints,
                 e.g. {"id": "INTEGER PRIMARY KEY", "name": "TEXT NOT NULL"}
        """
        cols_sql = ", ".join(f"{name} {definition}" for name, definition in columns.items())
        sql = f"CREATE TABLE IF NOT EXISTS {table_name} ({cols_sql})"
        with self.conn:
            self.conn.execute(sql)

    def write(self, table_name: str, data: dict[str, Any]) -> int:
        """Insert a row into a table. Returns the new row's id."""
        columns = ", ".join(data.keys())
        placeholders = ", ".join("?" for _ in data)
        sql = f"INSERT INTO {table_name} ({columns}) VALUES ({placeholders})"
        with self.conn:
            cursor = self.conn.execute(sql, tuple(data.values()))
        return cursor.lastrowid

    def read(
        self,
        table_name: str,
        where: Optional[dict[str, Any]] = None,
        columns: Iterable[str] = ("*",),
    ) -> list[dict[str, Any]]:
        """Read rows from a table, optionally filtered by exact-match conditions."""
        cols_sql = ", ".join(columns)
        sql = f"SELECT {cols_sql} FROM {table_name}"
        params: tuple = ()
        if where:
            conditions = " AND ".join(f"{key} = ?" for key in where)
            sql += f" WHERE {conditions}"
            params = tuple(where.values())
        cursor = self.conn.execute(sql, params)
        return [dict(row) for row in cursor.fetchall()]

    def search(self, table_name: str, columns: Iterable[str], term: str) -> list[dict[str, Any]]:
        """Search for rows where `term` appears anywhere in any of `columns`.

        Partial, case-insensitive matching (SQL LIKE), OR'd across columns --
        e.g. search("prompts", ["content", "response"], "refund") finds any
        row whose content or response contains "refund".
        """
        conditions = " OR ".join(f"{col} LIKE ?" for col in columns)
        sql = f"SELECT * FROM {table_name} WHERE {conditions}"
        params = tuple(f"%{term}%" for _ in columns)
        cursor = self.conn.execute(sql, params)
        return [dict(row) for row in cursor.fetchall()]

    def update(self, table_name: str, data: dict[str, Any], where: dict[str, Any]) -> int:
        """Update rows matching `where` with values in `data`. Returns rows affected."""
        set_sql = ", ".join(f"{key} = ?" for key in data)
        where_sql = " AND ".join(f"{key} = ?" for key in where)
        sql = f"UPDATE {table_name} SET {set_sql} WHERE {where_sql}"
        params = tuple(data.values()) + tuple(where.values())
        with self.conn:
            cursor = self.conn.execute(sql, params)
        return cursor.rowcount

    def delete(self, table_name: str, where: dict[str, Any]) -> int:
        """Delete rows matching `where`. Returns rows affected."""
        where_sql = " AND ".join(f"{key} = ?" for key in where)
        sql = f"DELETE FROM {table_name} WHERE {where_sql}"
        with self.conn:
            cursor = self.conn.execute(sql, tuple(where.values()))
        return cursor.rowcount

    def close(self) -> None:
        self.conn.close()

    def __enter__(self) -> "Database":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()


if __name__ == "__main__":
    db = Database("app.db")
    db.create_table(
        "users",
        {
            "id": "INTEGER PRIMARY KEY AUTOINCREMENT",
            "name": "TEXT NOT NULL",
            "email": "TEXT UNIQUE NOT NULL",
        },
    )