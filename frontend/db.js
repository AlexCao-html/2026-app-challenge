// SQLite storage for accounts + conversation history, re-implemented in Node
// (this used to live in ../database as a Python/FastAPI service -- kept there
// unused for reference). Uses node:sqlite (built-in, no native dependency to
// compile) rather than a third-party driver.
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "app.db");

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        token TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS conversation (
        conversation_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        conversation TEXT,
        creation_date TEXT NOT NULL,
        cost REAL NOT NULL DEFAULT 0
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS prompts (
        prompt_id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL REFERENCES conversation(conversation_id),
        prompt_time TEXT NOT NULL,
        content TEXT NOT NULL,
        response TEXT,
        input_media TEXT,
        output_media TEXT
    )
`);

module.exports = { db, DB_PATH };
