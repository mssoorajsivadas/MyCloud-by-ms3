import re


def is_valid_username(username):

    pattern = r"^[A-Za-z0-9_]{3,30}$"

    return re.match(pattern, username) is not None