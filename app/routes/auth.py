import secrets
import hashlib
from datetime import datetime,timezone, timedelta
from flask import Blueprint, request, jsonify, current_app
from app.extensions import db
from app.models.user import User
from werkzeug.security import generate_password_hash, check_password_hash
from app.models.email_verification_token import EmailVerificationToken
from app.utils.email import send_verification_email
from app.utils.verification import send_verification_email_for_user
from app.validators.email import is_valid_email
from app.validators.password import is_valid_password
from app.validators.username import is_valid_username
from app.utils.session import create_session, get_current_session,check_session_security, SECURITY_CHECK_INTERVAL, SESSION_IDLE_DAYS
from app.utils.email_verification import is_verification_grace_period_expired



auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

'''
#============================#

    Register Page

#============================#
'''
@auth_bp.route("/register", methods=["POST"])
def register():

    data = request.get_json()
    
    email = data.get("email", "").strip().lower()
    username = data.get("username", "").strip()
    first_name = data.get("first_name", "").strip()
    second_name = data.get("second_name", "").strip()
    password = data.get("password", "")

    if not email or not username or not first_name or not second_name or not password:
        return jsonify({
            "error": "All fields are required"
        }), 400

    if not is_valid_email(email):
        return jsonify({
            "error": "Invalid email address"
        }), 400

    if not is_valid_password(password):
        return jsonify({
            "error": "Password must be at least 8 characters"
        }), 400

    if not is_valid_username(username):
        return jsonify({
            "error": "Username must be 3-30 characters and contain only letters, numbers, and underscores"
        }), 400

    existing_email = User.query.filter_by(email=email).first()

    if existing_email:
        return jsonify({
            "error": "An account with this email already exists"
        }), 409

    existing_username = User.query.filter_by(username=username).first()

    if existing_username:
        return jsonify({
            "error": "Username already taken. Please choose another username"
        }), 409

    password_hash = generate_password_hash(password)

    user = User(
        email=email,
        username=username,
        first_name=first_name,
        second_name=second_name,
        password_hash=password_hash,
        status="active",
        email_verified=False
    )

    db.session.add(user)
    db.session.commit()

    try:
        send_verification_email_for_user(user)

        return jsonify({
            "message": "Account created successfully. Please check your email to verify your account.",
            "email_sent": True
        }), 201

    except Exception:
        current_app.logger.exception( 
            "Failed to send verification email for user ID %s",
            user.id
    )

    return jsonify({
        "message": (
            "Your account was created, but we couldn't send the "
            "verification email. You can correct your email address "
            "or request another verification email later."
        ),
        "email_sent": False
    }), 201

'''
#============================#

    Email Verify Page

#============================#
'''
@auth_bp.route("/verify-email", methods=["POST"])
def verify_email():
    data = request.get_json() or {}
    token = data.get("token", "")

    if not token:
        return jsonify({
            "error": "Verification token is required"
        }), 400

    token_hash = hashlib.sha256(token.encode()).hexdigest()

    verification = EmailVerificationToken.query.filter_by(
        token_hash=token_hash
    ).first()

    if not verification:
        return jsonify({
            "error": "Invalid verification token"
        }), 400

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    if verification.expires_at <= now:
        verification.status = "expired"
        db.session.commit()

        return jsonify({
            "error": "Verification token has expired"
        }), 400

    if verification.status != "active":
        return jsonify({
            "error": "This verification link is no longer valid."
        }), 400

    user = db.session.get(User, verification.user_id)

    if not user:
        return jsonify({
            "error": "User not found"
        }), 404

    user.email_verified = True
    verification.used_at = now
    verification.status = "used"

    db.session.commit()

    return jsonify({
        "message": "Email verified successfully"
    }), 200

'''
#============================#

   Login Page

#============================#
'''
@auth_bp.route("/login", methods=["POST"])
def login():

    data = request.get_json()

    login = data.get("login")
    password = data.get("password")

    if not login or not password:
        return jsonify({
            "message": "username and password are required"
        }), 400

    user = User.query.filter_by(username=login.lower()).first()

    if not user:
        return jsonify({
            "message": "Invalid username or password"
        }), 401

    if not check_password_hash(user.password_hash, password):
        return jsonify({
            "message": "Invalid username or password"
        }), 401

    session_token = create_session(user)

    verification_expired = is_verification_grace_period_expired(user)

    response = jsonify({
        "message": "Login successful",
        "email_verified": user.email_verified,
        "verification_grace_period_expired": verification_expired
    })

    response.set_cookie(
        "session_token",
        session_token,
        max_age=7 * 24 * 60 * 60,
        httponly=True,
        secure=False,
        samesite="Lax"
    )

    return response, 200

'''
#============================#

   User Info Page

#============================#
'''
@auth_bp.route("/me", methods=["GET"])
def me():

    current_session = get_current_session()

    if not current_session:
        return jsonify({
            "message": "Not logged in"
        })
    
        response.delete_cookie("session_token")

        return response, 401

    user = db.session.get(User, current_session.user_id)

    if not user:
        return jsonify({
            "message": "User not found"
        })
    
        response.delete_cookie("session_token")

        return response, 401

    now = datetime.now(
        timezone.utc
    ).replace(tzinfo=None)

    seconds_since_security_check = (
        now - current_session.last_security_check_at
    ).total_seconds()

    if (
        seconds_since_security_check
        >= SECURITY_CHECK_INTERVAL
    ):

        security_check = check_session_security(
            current_session
        )

        print(
            "SECURITY CHECK:",
            security_check
        )

        current_session.last_security_check_at = now

        if security_check["reauth_required"]:

            db.session.commit()

            return jsonify({
                "message": "Re-authentication required",
                "reauth_required": True
            }), 401

            response.delete_cookie("session_token") 
            return response, 401
        db.session.commit()

    return jsonify({
        "id": user.id,
        "username": user.username,
        "email_verified": user.email_verified
    }), 200

'''
#============================#

   Logout Page

#============================#
'''
@auth_bp.route("/logout", methods=["POST"])
def logout():

    current_session = get_current_session()

    if current_session:

        now = datetime.now(timezone.utc).replace(tzinfo=None)

        current_session.revoked = True
        current_session.revoked_at = now

        db.session.commit()

    response = jsonify({
        "message": "Logged out successfully"
    })

    response.delete_cookie("session_token")

    return response, 200

'''
#============================#

    Acitivity Chick
    
#============================#
'''
@auth_bp.route("/activity", methods=["POST"])
def activity():

    current_session = get_current_session()

    if not current_session:
        return jsonify({
            "message": "Not logged in"
        }), 401

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    current_session.last_seen_at = now

    current_session.idle_expires_at = (
        now + timedelta(days=SESSION_IDLE_DAYS)
    )

    db.session.commit()

    return jsonify({
        "message": "Activity updated"
    }), 200


'''
#============================#

    Resend Verify Email
    
#============================#
'''
@auth_bp.route("/resend-verification", methods=["POST"])
def resend_verification_email():
    current_session = get_current_session()

    if not current_session:
        return jsonify({
            "error": "Please sign in first."
        }), 401

    user = db.session.get(User, current_session.user_id)

    if not user:
        return jsonify({
            "error": "User not found."
        }), 404

    if user.email_verified:
        return jsonify({
            "message": "Your email is already verified."
        }), 400

    try:
        send_verification_email_for_user(user)

    except Exception:
        db.session.rollback()

        current_app.logger.exception(
            "Failed to resend verification email"
        )

        return jsonify({
            "error": "Unable to send verification email. Please try again later."
        }), 500

    return jsonify({
        "message": (
            "A verification email has been sent "
            "to your registered email address."
        )
    }), 200