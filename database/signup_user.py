"""One-off script: signs up a single user via login_api.signup."""

import login_api
from db import Database

USERNAME = "mangomustardman"
EMAIL = "mangomustardman@gmail.com"
PASSWORD = "miguel423miguel"


def main():
    with Database("app.db") as db:
        login_api.init_db(db)
        try:
            user_id = login_api.signup(db, USERNAME, EMAIL, PASSWORD)
            print(f"Created user {EMAIL!r} (username {USERNAME!r}) with id {user_id}")
        except login_api.AuthError as e:
            print(f"Signup failed ({e.status}): {e.message}")


if __name__ == "__main__":
    main()
