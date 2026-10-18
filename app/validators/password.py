def is_valid_password(password):

    if not isinstance(password, str):
        return False

    if not password or password.isspace():
        return False

    if len(password) < 12:
        return False

    if len(password) > 128:
        return False

    return True