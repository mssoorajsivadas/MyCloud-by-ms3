from flask import Blueprint, render_template, redirect, url_for
from app.utils.session import get_current_session

main_bp = Blueprint("main", __name__)

##lunching site
@main_bp.route("/")
def home():

    return render_template("main.html")

##signup site
@main_bp.route("/signup")
def signup():

    return render_template("signup.html")

##signin site
@main_bp.route("/signin")
def signin():

    return render_template("signin.html")

##verify email site
@main_bp.route("/verify-email")
def verify_email_page():

    return render_template("verify-email.html")

##drive site
@main_bp.route("/drive")
def drive_page():

    current_session = get_current_session()

    if not current_session:
        return redirect(url_for("main.signin"))

    return render_template("drive.html")

##reset password site
@main_bp.route("/reset-password")
def password_reset():

    return render_template("reset_password.html")

##forgot password site
@main_bp.route("/forgot-password")
def password_forgot():

    return render_template("forgot_password.html")