import secrets
import hashlib
from datetime import datetime, timezone, timedelta

from app.extensions import db
from app.models.email_verification_token import EmailVerificationToken
from app.utils.email import send_verification_email

'''
#=============================#

    Email Verify Mail Sender

#=============================#
'''
def send_verification_email_for_user(user):

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Invalidate any previous unused verification tokens.
    existing_tokens = EmailVerificationToken.query.filter(
        EmailVerificationToken.user_id == user.id,
        EmailVerificationToken.used_at.is_(None)
    ).all()

    for token in existing_tokens:
        token.status = "invalidated"
        token.used_at = now

    # Generate a fresh random verification token.
    verification_token = secrets.token_urlsafe(32)

    # Store only the hash in the database.
    token_hash = hashlib.sha256(
        verification_token.encode()
    ).hexdigest()

    verification = EmailVerificationToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=now + timedelta(hours=2),
        status="active"
    )

    db.session.add(verification)
    db.session.commit()

    verification_url = (
        "http://127.0.0.1:5000/verify-email"
        f"?token={verification_token}"
    )

    # If sending fails, the caller can handle the exception.
    send_verification_email(
        user.email,
        verification_url
    )

    return True


'''
#================================#

    Verify Mail Expired Checker

#================================#
'''
def mark_expired_verification_tokens():
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    count = EmailVerificationToken.query.filter(
        EmailVerificationToken.status == "active",
        EmailVerificationToken.expires_at <= now
    ).update(
        {"status": "expired"},
        synchronize_session=False
    )

    db.session.commit()
    return count