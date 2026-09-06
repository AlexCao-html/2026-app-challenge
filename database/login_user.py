"""One-off script: logs in a single user via login_api.signup."""

import login_api
from db import Database

USERNAME = "mangomustardman"
EMAIL = "mangomustardman@gmail.com"
PASSWORD = "miguel423miguel"


def main():
    with Database("app.db") as db:
        login_api.init_db(db)
        try:
            session_id = login_api.login(db, EMAIL, PASSWORD)
            print(f"logged in {EMAIL!r} (username {USERNAME!r}) with session id {session_id}")
        except login_api.AuthError as e:
            print(f"login failed ({e.status}): {e.message}")


if __name__ == "__main__":
    main()
