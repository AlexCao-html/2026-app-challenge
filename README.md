# 2026 App Challenge — ReelLife

One service, one process:

- `frontend/` — Express app that serves the ReelLife UI **and** the accounts/
  conversation-history API, all on the same port. See `frontend/README.md`
  for the API and code layout.
- `database/` — the original FastAPI/Python implementation of that same API.
  Superseded by the Node version in `frontend/` (the team is more comfortable
  in JS), kept in the repo for reference but not run anymore.

## Running it

```bash
cd frontend
npm install
npm start
```

Then open http://localhost:6767/login.html — sign up, log in, and the profile
page (`index.html`) will load your username/email from `GET /whoami`. The
frontend calls the API same-origin (see `frontend/public/config.js`), so
there's no CORS setup or second process to run.
