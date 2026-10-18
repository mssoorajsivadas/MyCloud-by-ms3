import re

USERNAME_PATTERN = re.compile(r"[a-z0-9_]{3,30}")


def is_valid_username(username):
    if not isinstance(username, str):
        return False

    return USERNAME_PATTERN.fullmatch(username) is not None