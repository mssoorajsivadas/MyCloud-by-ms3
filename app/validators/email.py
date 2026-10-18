from email_validator import validate_email, EmailNotValidError


def is_valid_email(email):
    if not isinstance(email, str):
        return False

    try:
        validate_email(
            email,
            check_deliverability=False
        )
        return True

    except EmailNotValidError:
        return False