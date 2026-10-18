import secrets
import hashlib
from datetime import datetime,timezone, timedelta
from flask import Blueprint, request, jsonify, current_app, make_response
from app.extensions import db
from app.models.user import User
from werkzeug.security import generate_password_hash, check_password_hash
from app.models.email_verification_token import EmailVerificationToken
from app.utils.email import send_verification_email, send_password_reset_email
from app.utils.verification import send_verification_email_for_user
from app.validators.email import is_valid_email
from app.validators.password import is_valid_password
from app.validators.username import is_valid_username
from app.utils.session import create_session, get_current_session,check_session_security, SECURITY_CHECK_INTERVAL, SESSION_IDLE_DAYS, SESSION_MAX_DAYS
from app.utils.email_verification import is_verification_grace_period_expired
from app.models.password_reset_token import PasswordResetToken
from app.utils.password_reset import send_password_reset_for_user
import os
from app.models.file import File
from app.models.folder import Folder
from app.models.session import Session



auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")



### Register Page ###
@auth_bp.route("/register", methods=["POST"])
def register():

    data = request.get_json(silent=True)

    # 1. Validate the request body
    if not isinstance(data, dict):
        return jsonify({
            "message": "A valid JSON request body is required"
        }), 400

    # 2. Check that all required fields are strings
    required_fields = (
        "email",
        "username",
        "first_name",
        "second_name",
        "password"
    )

    if any(not isinstance(data.get(field), str) for field in required_fields):
        return jsonify({
            "message": "All fields must be provided as strings"
        }), 400

    # 3. Normalize the fields
    email = data["email"].strip().lower()
    username = data["username"].strip().lower()
    first_name = data["first_name"].strip()
    second_name = data["second_name"].strip()
    password = data["password"]

    # 4. Check for empty fields
    if not email or not username or not first_name or not second_name or not password:
        return jsonify({
            "message": "All fields are required"
        }), 400

    # 5. Validate email
    if not is_valid_email(email):
        return jsonify({
            "message": "Invalid email address"
        }), 400

    # 6. Validate username
    if not is_valid_username(username):
        return jsonify({
            "message": (
                "Username must be 3-30 characters and contain "
                "only lowercase letters, numbers, and underscores"
            )
        }), 400

    # 7. Validate password
    if not is_valid_password(password):
        return jsonify({
            "message": "Password must meet the password requirements"
        }), 400

    # 8. Check whether the email already exists
    existing_email = User.query.filter_by(email=email).first()

    if existing_email:
        return jsonify({
            "message": "An account with this email already exists"
        }), 409

    # 9. Check whether the username already exists
    existing_username = User.query.filter_by(username=username).first()

    if existing_username:
        return jsonify({
            "message": "Username already taken. Please choose another username"
        }), 409

    # 10. Hash the password
    password_hash = generate_password_hash(password)

    # 11. Create the user
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

    # 12. Send the verification email
    try:
        send_verification_email_for_user(user)

        return jsonify({
            "message": (
                "Account created successfully. "
                "Please check your email to verify your account."
            ),
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
                "verification email. You can request another "
                "verification email later."
            ),
            "email_sent": False
        }), 201


###  Email Verify Page ###
@auth_bp.route("/verify-email", methods=["POST"])
def verify_email():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "A valid JSON request body is required"
        }), 400

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



### Login Page ###
@auth_bp.route("/login", methods=["POST"])
def login():

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "message": "A valid JSON request body is required"
        }), 400

    login = data.get("login")
    password = data.get("password")

    if not isinstance(login, str) or not isinstance(password, str):
        return jsonify({
            "message": "Username/email and password must be strings"
        }), 400

    login_value = login.strip()

    if not login_value or not password:
        return jsonify({
            "message": "Username/email and password are required"
        }), 400

    user = User.query.filter_by(email=login_value.lower()).first()

    if not user:
        user = User.query.filter_by(
            username=login_value.lower()
        ).first()

    if not user:
        return jsonify({
            "message": "Invalid username/email or password"
        }), 401

    if not check_password_hash(user.password_hash, password):
        return jsonify({
            "message": "Invalid username/email or password"
        }), 401

    if user.status != "active" or user.deleted_at is not None:
        return jsonify({
            "error": "This account is not available for login"
        }), 403

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
        max_age=SESSION_MAX_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=current_app.config.get("SESSION_COOKIE_SECURE", False),
        samesite="Lax",
        path="/"
    )

    return response, 200



### User Info Page ###
@auth_bp.route("/me", methods=["GET"])
def me():

    current_session = get_current_session()

    if not current_session:
        response = jsonify({
            "message": "Not logged in"
        })
        response.delete_cookie("session_token", path="/")
        return response, 401

    user = db.session.get(User, current_session.user_id)

    # Normally caught by get_current_session(), but retain this
    # check as defense in depth.
    if (
        not user
        or user.status != "active"
        or user.deleted_at is not None
    ):
        current_session.revoked = True
        current_session.revoked_at = (
            datetime.now(timezone.utc).replace(tzinfo=None)
        )

        db.session.commit()

        response = jsonify({
            "message": "Account is not available"
        })
        response.delete_cookie("session_token", path="/")
        return response, 401

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    last_check = current_session.last_security_check_at

    # Handle older sessions that might not have a timestamp.
    if last_check is None:
        current_session.last_security_check_at = now
        db.session.commit()

    else:
        seconds_since_security_check = (
            now - last_check
        ).total_seconds()

        if seconds_since_security_check >= SECURITY_CHECK_INTERVAL:

            security_check = check_session_security(
                current_session
            )

            # Record the check regardless of its result.
            current_session.last_security_check_at = now

            if security_check["reauth_required"]:
                current_session.revoked = True
                current_session.revoked_at = now

                db.session.commit()

                response = jsonify({
                    "message": "Re-authentication required",
                    "reauth_required": True
                })
                response.delete_cookie(
                    "session_token",
                    path="/"
                )
                return response, 401

            # Important: save the timestamp after a successful check.
            db.session.commit()

    return jsonify({
        "id": user.id,
        "username": user.username,
        "first_name": user.first_name,
        "second_name": user.second_name,
        "email": user.email,
        "email_verified": user.email_verified
    }), 200



### Logout Page ###
@auth_bp.route("/logout", methods=["POST"])
def logout():
    current_session = get_current_session()

    if current_session:
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        current_session.revoked = True
        current_session.revoked_at = now

        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
            current_app.logger.exception("Failed to revoke session")

            return jsonify({
                "error": "Unable to complete logout"
            }), 500

    response = jsonify({
        "message": "Logged out successfully"
    })

    response.delete_cookie(
        "session_token",
        path="/",
        secure=current_app.config.get("SESSION_COOKIE_SECURE", False),
        httponly=True,
        samesite="Lax"
    )

    return response, 200
    return response, 200



### Acitivity Chick ###  
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

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception(
            "Failed to update session activity"
        )

        return jsonify({
            "error": "Unable to update session activity"
        }), 500

    return jsonify({
        "message": "Activity updated"
    }), 200



### Resend Verify Email ###
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



### User account update ###
@auth_bp.route("/me/profile", methods=["PATCH"])
def update_profile():
    # Use the same authentication/session lookup as your existing /me route.
    # This example assumes it provides the logged-in user's ID.
    current_session = get_current_session()

    if not current_session:
        return jsonify({
            "message": "Please log in to update your account"
        }), 401

    user = db.session.get(User, current_session.user_id)

    if not user or user.status != "active" or user.deleted_at is not None:
        return jsonify({
            "message": "Account not found or unavailable"
        }), 404

    # 1. Validate the JSON request body.
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "message": "A valid JSON request body is required"
        }), 400

    # 2. Validate field types.
    required_fields = ("first_name", "second_name", "email")

    if any(
        not isinstance(data.get(field), str)
        for field in required_fields
    ):
        return jsonify({
            "message": "First name, second name, and email must be strings"
        }), 400

    # 3. Normalize values.
    first_name = data["first_name"].strip()
    second_name = data["second_name"].strip()
    email = data["email"].strip().lower()

    # 4. Check empty values.
    if not first_name or not second_name or not email:
        return jsonify({
            "message": "All fields are required"
        }), 400

    # 5. Validate lengths against the User model.
    if len(first_name) > 100 or len(second_name) > 100:
        return jsonify({
            "message": "Names must be 100 characters or fewer"
        }), 400

    if len(email) > 255:
        return jsonify({
            "message": "Email address is too long"
        }), 400

    # 6. Validate the email format.
    if not is_valid_email(email):
        return jsonify({
            "message": "Invalid email address"
        }), 400

    # 7. Check whether another account uses this email.
    existing_email = User.query.filter(
        User.email == email,
        User.id != user.id
    ).first()

    if existing_email:
        return jsonify({
            "message": "An account with this email already exists"
        }), 409

    # 8. Determine whether the email is actually changing.
    email_changed = email != user.email

    # 9. Update the account.
    user.first_name = first_name
    user.second_name = second_name

    if email_changed:
        user.email = email
        user.email_verified = False

    # 10. Save changes.
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception(
            "Failed to update profile for user ID %s",
            user.id
        )

        return jsonify({
            "message": "Unable to update your account"
        }), 500

    return jsonify({
        "message": "Account updated successfully",
        "user": {
            "id": user.id,
            "username": user.username,
            "first_name": user.first_name,
            "second_name": user.second_name,
            "email": user.email,
            "email_verified": user.email_verified
        },
        "email_changed": email_changed
    }), 200




###  Change Password ###
@auth_bp.route("/change-password", methods=["POST"])
def change_password():

    # 1. Identify the logged-in session.
    current_session = get_current_session()

    if not current_session:
        return jsonify({
            "error": "Please log in to change your password"
        }), 401

    # 2. Find the user associated with this session.
    user = db.session.get(
        User,
        current_session.user_id
    )

    if not user:
        return jsonify({
            "error": "User account not found"
        }), 404

    # 3. Validate the request body.
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "A valid JSON request body is required"
        }), 400

    current_password = data.get("current_password")
    new_password = data.get("new_password")
    confirm_password = data.get("confirm_password")

    if not all(
        isinstance(password, str) and password
        for password in (
            current_password,
            new_password,
            confirm_password
        )
    ):
        return jsonify({
            "error": "All password fields are required"
        }), 400

    # 4. Check that the new passwords match.
    if new_password != confirm_password:
        return jsonify({
            "error": "New passwords do not match"
        }), 400

    # 5. Verify the current password.
    if not check_password_hash(
        user.password_hash,
        current_password
    ):
        return jsonify({
            "error": "Your current password is incorrect"
        }), 400

    # 6. Validate the new password using your existing rules.
    if not is_valid_password(new_password):
        return jsonify({
            "error": "The new password does not meet the password requirements"
        }), 400

    # 7. Prevent changing to the same password.
    if check_password_hash(user.password_hash, new_password):
        return jsonify({
            "error": "Your new password must be different from your current password"
        }), 400

    # 8. Hash and save the new password.
    user.password_hash = generate_password_hash(
        new_password
    )

    try:
        db.session.commit()

    except Exception:
        db.session.rollback()

        current_app.logger.exception(
            "Failed to change password for user ID %s",
            user.id
        )

        return jsonify({
            "message": "Unable to change your password. Please try again"
        }), 500

    # 9. Return success.
    return jsonify({
        "message": "Password changed successfully"
    }), 200



### Forgot Password ###
@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()

    # Use the same response whether or not the account exists.
    response = jsonify({
        "message": (
            "If an account exists with that email, "
            "a password reset link will be sent."
        )
    })

    # Validate the email format.
    if not email or not is_valid_email(email):
        return response, 200

    # Find the user by email.
    user = User.query.filter_by(email=email).first()

    # Do not reveal whether the account exists.
    if not user:
        return response, 200

    # Generate the reset token and send the email.
    
    try:

        send_password_reset_for_user(user)

    except Exception:

        return jsonify({
                "message": "Password reset failed."
            }), 400

    return jsonify({
            "message": "Password reset link send successfully."
        }), 200


### Reset Password ###
@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json(silent=True) or {}

    token = data.get("token", "").strip()
    new_password = data.get("new_password", "")
    confirm_password = data.get("confirm_password", "")

    if not token or not new_password or not confirm_password:
        return jsonify({
            "error": "Please fill in all fields."
        }), 400

    if new_password != confirm_password:
        return jsonify({
            "error": "Passwords do not match."
        }), 400

    if not is_valid_password(new_password):
        return jsonify({
            "error": "Password does not meet the requirements."
        }), 400

    # Hash the token so we can compare it with the stored hash.
    token_hash = hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()

    reset_token = PasswordResetToken.query.filter_by(
        token_hash=token_hash,
        status="active"
    ).first()

    if not reset_token:
        return jsonify({
            "error": "This reset link is invalid or has expired."
        }), 400

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    if reset_token.expires_at <= now or reset_token.used_at is not None:
        reset_token.status = "expired" if reset_token.expires_at <= now else "used"
        db.session.commit()

        return jsonify({
            "error": "This reset link is invalid or has expired."
        }), 400

    user = db.session.get(User, reset_token.user_id)

    if not user:
        return jsonify({
            "error": "This reset link is invalid or has expired."
        }), 400

    # Save the new password as a secure password hash.
    user.password_hash = generate_password_hash(new_password)

    # Mark this token as used so it cannot be reused.
    reset_token.used_at = now
    reset_token.status = "used"

    db.session.commit()

    return jsonify({
        "message": "Your password has been reset successfully."
    }), 200




### Account Deletion ###
@auth_bp.route("/delete-account", methods=["POST"])
def delete_account():
    current_session = get_current_session()

    if not current_session:
        response = make_response(jsonify({
            "error": "Authentication required."
        }), 401)

        response.delete_cookie("session_token", path="/")
        return response

    data = request.get_json(silent=True) or {}
    password = data.get("password")

    if not isinstance(password, str) or not password:
        return jsonify({
            "error": "Your current password is required."
        }), 400

    user = db.session.get(User, current_session.user_id)

    if (
        user is None
        or user.status != "active"
        or user.deleted_at is not None
    ):
        response = make_response(jsonify({
            "error": "This account is unavailable."
        }), 401)

        response.delete_cookie("session_token", path="/")
        return response

    if not check_password_hash(user.password_hash, password):
        return jsonify({
            "error": "The password you entered is incorrect."
        }), 403

    user_id = user.id
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    uploads_dir = os.path.join(
        current_app.instance_path,
        "uploads",
    )

    thumbnails_dir = os.path.join(
        current_app.instance_path,
        "thumbnails",
    )

    # Collect only files owned by this user.
    user_files = File.query.filter_by(user_id=user_id).all()

    # Collect all folders owned by this user.
    user_folder_ids = get_user_folder_ids(user_id)

    # Validate the stored filenames before changing the database.
    paths_to_delete = set()

    try:
        for file_record in user_files:
            stored_path = get_safe_storage_path(
                uploads_dir,
                file_record.stored_name,
            )

            if stored_path:
                paths_to_delete.add(stored_path)

            thumbnail_path = get_safe_storage_path(
                thumbnails_dir,
                file_record.thumbnail_name,
            )

            if thumbnail_path:
                paths_to_delete.add(thumbnail_path)

        # Verify that the paths belong to the expected storage directories.
        for path in paths_to_delete:
            if os.path.commonpath([
                os.path.abspath(uploads_dir),
                os.path.abspath(path),
            ]) != os.path.abspath(uploads_dir) and (
                os.path.commonpath([
                    os.path.abspath(thumbnails_dir),
                    os.path.abspath(path),
                ]) != os.path.abspath(thumbnails_dir)
            ):
                raise ValueError("Invalid storage path")

        # Revoke every session belonging to this user.
        Session.query.filter_by(
            user_id=user_id,
            revoked=False,
        ).update(
            {
                Session.revoked: True,
                Session.revoked_at: now,
            },
            synchronize_session=False,
        )

        # Delete this user's file records.
        File.query.filter_by(user_id=user_id).delete(
            synchronize_session=False
        )

        # Delete this user's folder records.
        # Delete children before parents to support self-referencing FKs.
        folders_to_delete = list(user_folder_ids)

        if folders_to_delete:
            while folders_to_delete:
                leaves = [
                    folder_id
                    for folder_id in folders_to_delete
                    if not Folder.query.filter_by(
                        user_id=user_id,
                        parent_id=folder_id,
                    ).filter(
                        Folder.id.in_(folders_to_delete)
                    ).first()
                ]

                if not leaves:
                    raise ValueError(
                        "Unable to safely delete the folder hierarchy."
                    )

                Folder.query.filter(
                    Folder.user_id == user_id,
                    Folder.id.in_(leaves),
                ).delete(synchronize_session=False)

                deleted_ids = set(leaves)
                folders_to_delete = [
                    folder_id
                    for folder_id in folders_to_delete
                    if folder_id not in deleted_ids
                ]

        # Preserve the account record for deletion history.
        user.status = "deleted"
        user.deleted_at = now

        db.session.commit()

    except Exception:
        db.session.rollback()

        current_app.logger.exception(
            "Account deletion failed for user ID %s",
            user_id,
        )

        return jsonify({
            "error": "Account deletion failed. No database changes were saved."
        }), 500

    # Remove physical files after the database transaction succeeds.
    cleanup_errors = []

    for path in paths_to_delete:
        try:
            if os.path.isfile(path):
                os.remove(path)
        except OSError:
            cleanup_errors.append(path)
            current_app.logger.exception(
                "Could not remove stored file during account deletion."
            )

    response = make_response(jsonify({
        "message": "Your account has been deleted.",
        "files_removed": len(paths_to_delete) - len(cleanup_errors),
        "cleanup_pending": bool(cleanup_errors),
    }), 200)

    response.delete_cookie(
        "session_token",
        path="/",
        secure=request.is_secure,
        httponly=True,
        samesite="Lax",
    )

    return response


def get_user_folder_ids(user_id):
    """Return all folder IDs owned by a user, including nested folders."""

    folders = Folder.query.filter_by(user_id=user_id).all()

    children = {}

    for folder in folders:
        children.setdefault(folder.parent_id, []).append(folder.id)

    folder_ids = set()
    pending = list(children.get(None, []))

    while pending:
        folder_id = pending.pop()

        if folder_id in folder_ids:
            continue

        folder_ids.add(folder_id)
        pending.extend(children.get(folder_id, []))

    return folder_ids


def get_safe_storage_path(directory, filename):
    """Build a path for a stored filename without allowing directory traversal."""

    if not filename or not isinstance(filename, str):
        return None

    # Stored names should be filenames, not arbitrary paths.
    if filename != os.path.basename(filename):
        raise ValueError("Invalid stored filename")

    return os.path.join(directory, filename)