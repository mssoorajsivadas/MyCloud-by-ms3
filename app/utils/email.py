from flask import current_app
from flask_mail import Message
from app.extensions import mail

'''
---------------------------------------
|   Send email for email Verify API   |
---------------------------------------
'''
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