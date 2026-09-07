# ReelLife frontend + API

One Express process serves the static UI (`public/`) and the accounts/
conversation-history API. This used to be two services -- this Express app
plus a separate Python/FastAPI service in `../database` -- converged into one
so there's only one process to run. The API here is a from-scratch Node
re-implementation of `../database`'s API (kept there, unused, for reference),
not a port of its code.

Kept the same on purpose:

- table/column layout (`users`, `sessions`, `conversation`, `prompts`)
- password hashing format (PBKDF2-HMAC-SHA256, 200k iterations,
  `<saltHex>$<digestHex>`) -- a hash produced by either backend verifies
  against the other
- "one active session per user" login model (opaque bearer token stored
  server-side, not a JWT)

## Stack

- **express** -- HTTP server, both static files and the API
- **node:sqlite** (built-in, no native dependency to install/compile) --
  storage. It's still an experimental Node API, so `npm start`/`npm test`
  print an `ExperimentalWarning`; that's expected. Requires Node >= 22.5.
- **node:crypto** -- password hashing + session tokens
- **node:test** (built-in) -- the test suite, no test framework dependency

## Project layout

```
app.js            Express app: JSON body parsing, static files, the two
                   routers below, error-handling middleware
auth.js           /signup /login /logout /whoami + the requireAuth middleware
conversations.js  /conversations, /prompts
db.js             node:sqlite connection + schema (CREATE TABLE IF NOT EXISTS)
security.js       password hashing + session token helpers
storage.js        transcript/media file helpers
errors.js         ApiError(status, message)
test/             node --test suite (auth.test.js, conversations.test.js)
public/           static frontend (see below)
```

Large content -- the running conversation transcript and any attached media
-- is written to files under `MEDIA_ROOT` (default `conversation_files/`),
with only the file path stored in the database. See `storage.js`.

## Setup

```bash
cd frontend
npm install
npm start
```

Runs on http://localhost:6767 by default (`PORT` env var to change it).
Tables are created automatically on startup -- no migration step.

### Configuration (env vars)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `6767` | Port the Express app listens on |
| `DATABASE_PATH` | `./app.db` | SQLite file path |
| `MEDIA_ROOT` | `./conversation_files` | Where transcripts/media attachments are written |

## Running the tests

```bash
cd frontend
npm test
```

`node --test` runs each test file in its own process, so `test/auth.test.js`
and `test/conversations.test.js` each get a fresh throwaway SQLite file and
media directory (set via `DATABASE_PATH`/`MEDIA_ROOT` at the top of the file,
before `../app` is required) -- nothing touches the real `app.db` or
`conversation_files/`.

## API

All endpoints below (except `/signup`, `/login`) require
`Authorization: Bearer <token>` from `/login`.

- `POST /signup` -- `{"username", "email", "password"}` -> `201 {"id": ...}`
- `POST /login` -- `{"email", "password"}` -> `200 {"token": ...}` (invalidates
  any previous session for that user)
- `POST /logout` -- revokes the current session token -> `200 {"ok": true}`
- `GET /whoami` -> `200 {"id", "username", "email"}`
- `POST /conversations` -> `201 {"conversation_id": ...}`
- `GET /conversations` -- list the caller's conversations
- `GET /conversations/{id}` -- a single conversation (404 if it isn't yours)
- `GET /conversations/{id}/prompts` -- that conversation's prompts, oldest first
- `POST /conversations/{id}/prompts` -- `{"content", "input_media_filename"?,
  "input_media_base64"?}` -> `201 {"prompt_id": ...}`
- `POST /prompts/{id}/response` -- `{"response", "output_media_filename"?,
  "output_media_base64"?, "cost"?}` -> `200 {"ok": true}` (adds `cost` to the
  conversation's running total)

## Frontend pages

- `public/config.js` -- `API_BASE_URL` (empty string; same-origin now)
- `public/storage_api.js` -- the only place that calls the API (token storage
  + fetch wrapper); `login.html`/`index.html`'s scripts all go through it
- `public/login.html` + `loginScript.js` -- login/signup form
- `public/index.html` + `profile.js` -- profile page, guarded behind a valid
  session
- `public/index.html`'s "Test" tab + `testChat.js` -- a conversation list +
  chat UI exercising `/conversations` and `/prompts`; user-only input, with a
  canned (not real-AI) assistant reply generated and persisted per message
