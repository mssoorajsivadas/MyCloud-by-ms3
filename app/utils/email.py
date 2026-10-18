from flask import current_app
from flask_mail import Message
from app.extensions import mail


### Send email for email Verify API ###
def send_verification_email(email, verification_url):

    message = Message(
        subject="Verify your Cloud Drive account",
        sender=current_app.config["MAIL_USERNAME"],
        recipients=[email]
    )

    message.body = f"""
Hello,

Please click the link below to verify your Cloud Drive account:

{verification_url}

This link will expire after 2 hours.

If you did not create this account, you can ignore this email.
"""

    mail.send(message)




### Send email for Password Reset API ###
def send_password_reset_email(email, reset_url):

    message = Message(
        subject="Reset your Cloud Drive password",
        sender=current_app.config["MAIL_USERNAME"],
        recipients=[email]
    )

    message.body = f"""
Hello,

We received a request to reset the password for your Cloud Drive account.

Click the link below to choose a new password:

{reset_url}

This link will expire after 15 minutes and can only be used once.

If you did not request a password reset, you can ignore this email.
Your current password will remain unchanged.

"""

    mail.send(message)