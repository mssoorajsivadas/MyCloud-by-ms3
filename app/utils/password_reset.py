import secrets
import hashlib

from datetime import datetime, timezone, timedelta

from app.extensions import db
from app.models.password_reset_token import PasswordResetToken
from app.utils.email import send_password_reset_email


def send_password_reset_for_user(user):
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Invalidate previous active reset tokens.
    existing_tokens = PasswordResetToken.query.filter_by(
        user_id=user.id,
        status="active"
    ).all()

    for token in existing_tokens:
        token.status = "revoked"

    # Generate a new, unpredictable token.
    reset_token = secrets.token_urlsafe(32)

    # Store only the token hash in the database.
    token_hash = hashlib.sha256(
        reset_token.encode("utf-8")
    ).hexdigest()

    reset_record = PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=now + timedelta(minutes=15),
        status="active"
    )

    db.session.add(reset_record)
    db.session.commit()

    # Construct the URL that opens the reset-password page.
    from flask import current_app

    reset_url = (
        f"{current_app.config['FRONTEND_URL'].rstrip('/')}"
        f"/reset-password?token={reset_token}"
    )

    # Send the URL through the existing email sender.
    send_password_reset_email(
        user.email,
        reset_url
    )

    return True