from datetime import datetime, timedelta, timezone


VERIFICATION_GRACE_PERIOD = timedelta(days=7)



### Email Verify Deadline ###
def is_verification_grace_period_expired(user):
    if user.email_verified:
        return False

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    registered_at = user.created_at

    return now >= registered_at + VERIFICATION_GRACE_PERIOD



### Email Verify Checker ###
def require_drive_access(user):
    if is_verification_grace_period_expired(user):
        return {
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }, 403

    return None