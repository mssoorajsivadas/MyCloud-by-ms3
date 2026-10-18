import os
import uuid
import shutil

from flask import (
    Blueprint,
    request,
    jsonify,
    current_app,
    send_file,
    send_from_directory
)
from datetime import datetime, timezone
from app.extensions import db
from app.models.file import File
from app.models.folder import Folder
from werkzeug.utils import secure_filename
from app.utils.session import get_current_session
from app.models.user import User
from app.utils.email_verification import is_verification_grace_period_expired
from app.services.file_service import get_unique_file_name,detect_file_type, create_thumbnail, get_preview_mimetype


file_bp = Blueprint("file", __name__, url_prefix="/api/files")



### File Upload ###
@file_bp.route("/", methods=["POST"])
def upload_file():
    current_session = get_current_session()

    if not current_session:
        return jsonify({
            "error": "Not logged in"
        }), 401

    user_id = current_session.user_id
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({
            "error": "User not found"
        }), 401

    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }), 403

    # Get all uploaded files.
    uploaded_files = request.files.getlist("files")

    # Support the existing single-file field for backward compatibility.
    if not uploaded_files:
        single_file = request.files.get("file")

        if single_file:
            uploaded_files = [single_file]

    # Remove empty file-picker entries.
    uploaded_files = [
        uploaded_file
        for uploaded_file in uploaded_files
        if uploaded_file and uploaded_file.filename
    ]

    if not uploaded_files:
        return jsonify({
            "error": "No files uploaded"
        }), 400

    # Validate the optional destination folder ID.
    raw_folder_id = request.form.get("folder_id")

    if raw_folder_id in (None, ""):
        folder_id = None
    else:
        try:
            folder_id = int(raw_folder_id)

            if folder_id <= 0:
                raise ValueError

        except (TypeError, ValueError):
            return jsonify({
                "error": "Invalid folder ID"
            }), 400

    # A user can upload only into their own folders.
    if folder_id is not None:
        folder = Folder.query.filter_by(
            id=folder_id,
            user_id=user_id
        ).first()

        if not folder:
            return jsonify({
                "error": "Folder not found"
            }), 404

    successful_files = []
    failed_files = []

    for uploaded_file in uploaded_files:
        original_name = secure_filename(uploaded_file.filename)

        if not original_name:
            failed_files.append({
                "name": uploaded_file.filename,
                "error": "Invalid filename"
            })
            continue

        stored_name = f"{uuid.uuid4().hex}{os.path.splitext(original_name)[1]}"

        storage_folder = os.path.join(
            current_app.instance_path,
            "uploads"
        )

        os.makedirs(storage_folder, mode=0o700, exist_ok=True)
        os.chmod(storage_folder, 0o700)

        file_path = os.path.join(
            storage_folder,
            stored_name
        )

        try:
            # Generate a unique display name for this folder.
            name = get_unique_file_name(
                original_name,
                user_id,
                folder_id
            )

            # Save the physical file.
            uploaded_file.save(file_path)
            os.chmod(file_path, 0o600)

            size = os.path.getsize(file_path)
            file_type = detect_file_type(
                original_name,
                file_path
            )
            thumbnail_name = create_thumbnail(
                file_path,
                file_type
            )

            # Create its database record.
            file = File(
                name=name,
                stored_name=stored_name,
                size=size,
                file_type=file_type,
                user_id=user_id,
                folder_id=folder_id,
                thumbnail_name=thumbnail_name
            )

            db.session.add(file)
            db.session.commit()

            successful_files.append({
                "id": file.id,
                "name": file.name,
                "size": file.size,
                "folder_id": file.folder_id
            })

        except Exception:
            db.session.rollback()

            # Remove the physical file if the database operation failed.
            try:
                if os.path.isfile(file_path):
                    os.remove(file_path)
            except OSError:
                current_app.logger.exception(
                    "Failed to clean up uploaded file: %s",
                    file_path
                )

            current_app.logger.exception(
                "Failed to upload file: %s",
                original_name
            )

            failed_files.append({
                "name": original_name,
                "error": "File upload failed. Please try again."
            })

    # Determine the overall result.
    if successful_files and failed_files:
        status_code = 207
        message = "Some files uploaded successfully."
    elif successful_files:
        status_code = 201
        message = "Files uploaded successfully."
    else:
        status_code = 500
        message = "No files could be uploaded."

    return jsonify({
        "message": message,
        "uploaded": successful_files,
        "failed": failed_files,
        "total": len(uploaded_files),
        "successful_count": len(successful_files),
        "failed_count": len(failed_files)
    }), status_code



### Thumbnail send ###
@file_bp.route("/<int:file_id>/thumbnail", methods=["GET"])
def get_file_thumbnail(file_id):
    current_session = get_current_session()

    if not current_session:
        return jsonify({"error": "Not logged in"}), 401

    file = File.query.filter_by(
        id=file_id,
        user_id=current_session.user_id
    ).first()

    if not file:
        return jsonify({"error": "File not found"}), 404

    # Only images and PDFs have generated thumbnails.
    is_image = file.file_type == "image"

    is_pdf = (
        file.file_type == "pdf"
        and os.path.splitext(file.name)[1].lower() == ".pdf"
    )

    is_video = (
        file.file_type == "video"
        and os.path.splitext(file.name)[1].lower()
        in {".mp4", ".mkv", ".mov", ".avi", ".webm"}
    )

    if not (is_image or is_pdf or is_video) or not file.thumbnail_name:
        return jsonify({
            "error": "Thumbnail not available"
        }), 404

    thumbnail_folder = os.path.join(
        current_app.instance_path,
        "thumbnails"
    )

    return send_from_directory(
        thumbnail_folder,
        file.thumbnail_name,
        mimetype="image/jpeg",
        as_attachment=False
    )


### File Download ###
@file_bp.route("/<int:file_id>/download", methods=["GET"])
def download_file(file_id):

    current_session = get_current_session()

    if not current_session:
        return jsonify({
            "error": "Not logged in"
        }), 401

    user_id = current_session.user_id

    user = db.session.get(User, user_id)

    if not user:
        return jsonify({
            "error": "User not found"
        }), 401

    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }), 403

    # Find the file belonging to the current user.
    file = File.query.filter_by(
        id=file_id,
        user_id=user_id
    ).first()

    if not file:
        return jsonify({
            "error": "File not found"
        }), 404

    storage_folder = os.path.join(
        current_app.instance_path,
        "uploads"
    )

    file_path = os.path.join(
        storage_folder,
        file.stored_name
    )

    # Check that the physical file exists and is a regular file.
    if not os.path.isfile(file_path):
        return jsonify({
            "error": "File not found"
        }), 404

    return send_file(
        file_path,
        as_attachment=True,
        download_name=file.name
    )



### File Preview ###
@file_bp.route("/<int:file_id>/preview", methods=["GET"])
def preview_file(file_id):

    current_session = get_current_session()

    if not current_session:
        return jsonify({
            "error": "Not logged in"
        }), 401

    user_id = current_session.user_id

    user = db.session.get(User, user_id)

    if not user:
        return jsonify({
            "error": "User not found"
        }), 401

    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }), 403

    file = File.query.filter_by(
        id=file_id,
        user_id=user_id
    ).first()

    if not file:
        return jsonify({
            "error": "File not found"
        }), 404

    mimetype = get_preview_mimetype(
        file.stored_name,
        file.file_type
    )

    if not mimetype:
        return jsonify({
            "error": "preview_not_supported",
            "message": "Preview not supported. Please download this file."
        }), 415

    storage_folder = os.path.join(
        current_app.instance_path,
        "uploads"
    )

    file_path = os.path.join(
        storage_folder,
        file.stored_name
    )

    if not os.path.isfile(file_path):
        return jsonify({
            "error": "File not found"
        }), 404

    response = send_file(
        file_path,
        mimetype=mimetype,
        as_attachment=False,
        conditional=True,
        download_name=file.name
    )

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "private, no-store"

    # Keep the original filename from being interpreted as a response header.
    response.headers["Content-Security-Policy"] = "default-src 'none'; sandbox"

    return response



### File Info ###
@file_bp.route("/", methods=["GET"])
def get_files():
    # 1. Check login
    current_session = get_current_session()

    if not current_session:
        return jsonify({
            "error": "Not logged in"
        }), 401

    user_id = current_session.user_id

    # 2. Check user
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({
            "error": "User not found"
        }), 401

    # 3. Check email verification
    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }), 403

    # 4. Read the folder_id query parameter
    raw_folder_id = request.args.get("folder_id")

    if raw_folder_id is None:
        # No folder_id means the root directory
        folder_id = None

    else:
        # Validate the supplied folder ID
        try:
            folder_id = int(raw_folder_id)

            if folder_id <= 0:
                raise ValueError

        except (ValueError, TypeError):
            return jsonify({
                "error": "Invalid folder ID"
            }), 400

        # 5. Verify that the folder belongs to this user
        folder = Folder.query.filter_by(
            id=folder_id,
            user_id=user_id
        ).first()

        if not folder:
            return jsonify({
                "error": "Folder not found"
            }), 404

    # 6. Retrieve only this user's files in the requested folder
    files = File.query.filter(
        File.user_id == user_id,
        File.folder_id == folder_id,
        File.deleted_at.is_(None)
    ).order_by(
        File.name.asc()
    ).all()

    # 7. Return the information needed by the frontend
    return jsonify([
        {
            "id": file.id,
            "name": file.name,
            "folder_id": file.folder_id,
            "size": file.size,
            "file_type": file.file_type,
            "thumbnail_name": file.thumbnail_name
        }
        for file in files
    ]), 200



### File rename ###
@file_bp.route("/<int:file_id>", methods=["PATCH"])
def rename_file(file_id):
    # 1. Check login
    current_session = get_current_session()

    if not current_session:
        return jsonify({
            "error": "Not logged in"
        }), 401

    user_id = current_session.user_id

    # 2. Check user
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({
            "error": "User not found"
        }), 401

    # 3. Check email verification
    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }), 403

    # 4. Find the file belonging to this user
    file = File.query.filter_by(
        id=file_id,
        user_id=user_id
    ).first()

    if not file:
        return jsonify({
            "error": "File not found"
        }), 404

    # 5. Validate request data
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "Invalid request data"
        }), 400

    new_name = data.get("name")

    if not isinstance(new_name, str) or not new_name.strip():
        return jsonify({
            "error": "File name is required"
        }), 400

    new_name = new_name.strip()

    # 6. Check filename length
    if len(new_name) > 255:
        return jsonify({
            "error": "File name cannot exceed 255 characters"
        }), 400

    # 7. Check for duplicate names in the same folder
    existing_file = File.query.filter(
        File.name == new_name,
        File.user_id == user_id,
        File.folder_id == file.folder_id,
        File.deleted_at.is_(None)
    ).first()

    if existing_file and existing_file.id != file.id:
        return jsonify({
            "error": "A file with this name already exists"
        }), 409

    # 8. Rename the file in the database
    try:
        file.name = new_name
        db.session.commit()

    except Exception:
        db.session.rollback()

        current_app.logger.exception("Failed to rename file")

        return jsonify({
            "error": "Failed to rename file"
        }), 500

    # 9. Return success
    return jsonify({
        "message": "File renamed successfully",
        "file": {
            "id": file.id,
            "name": file.name,
            "folder_id": file.folder_id
        }
    }), 200


### Delete File ###
@file_bp.route("/<int:file_id>", methods=["DELETE"])
def delete_file(file_id):
    # 1. Check login
    current_session = get_current_session()

    if not current_session:
        return jsonify({
            "error": "Not logged in"
        }), 401

    user_id = current_session.user_id

    # 2. Check user
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({
            "error": "User not found"
        }), 401

    # 3. Check email verification
    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }), 403

    # 4. Find the file belonging to this user
    file = File.query.filter_by(
        id=file_id,
        user_id=user_id
    ).first()

    if not file or file.deleted_at is not None:
        return jsonify({
            "error": "File not found"
        }), 404

    # 5. Move the file to Trash
    try:
        file.deleted_at = datetime.now(timezone.utc)

        db.session.commit()

    except Exception:
        db.session.rollback()

        current_app.logger.exception(
            "Failed to move file to Trash"
        )

        return jsonify({
            "error": "Failed to move file to Trash"
        }), 500

    # 6. Return success
    return jsonify({
        "message": "File moved to Trash successfully"
    }), 200



### Move File ###
@file_bp.route("/<int:file_id>/move", methods=["PATCH"])
def move_file(file_id):
    # 1. Check login
    current_session = get_current_session()

    if not current_session:
        return jsonify({
            "error": "Not logged in"
        }), 401

    user_id = current_session.user_id

    # 2. Check user
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({
            "error": "User not found"
        }), 401

    # 3. Check email verification
    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }), 403

    # 4. Find the file belonging to this user
    file = File.query.filter_by(
        id=file_id,
        user_id=user_id
    ).first()

    if not file:
        return jsonify({
            "error": "File not found"
        }), 404

    # 5. Validate request data
    data = request.get_json(silent=True)

    if not isinstance(data, dict) or "folder_id" not in data:
        return jsonify({
            "error": "A valid folder_id is required. Use null for the root directory."
        }), 400

    folder_id = data["folder_id"]

    # 6. Validate the destination folder ID
    if folder_id is not None:
        if type(folder_id) is not int or folder_id <= 0:
            return jsonify({
                "error": "folder_id must be a positive integer or null"
            }), 400

        # Make sure the destination belongs to this user
        folder = Folder.query.filter_by(
            id=folder_id,
            user_id=user_id
        ).first()

        if not folder:
            return jsonify({
                "error": "Destination folder not found"
            }), 404

    # 7. Check whether the file is already in that folder
    if file.folder_id == folder_id:
        return jsonify({
            "error": "File is already in this folder"
        }), 400

    # 8. Generate a unique filename in the destination
    new_name = get_unique_file_name(
        file.name,
        user_id,
        folder_id
    )

    # 9. Update the file's location
    try:
        file.name = new_name
        file.folder_id = folder_id

        db.session.commit()

    except Exception:
        db.session.rollback()

        current_app.logger.exception("Failed to move file")

        return jsonify({
            "error": "Failed to move file"
        }), 500

    # 10. Return success
    return jsonify({
        "message": "File moved successfully",
        "file": {
            "id": file.id,
            "name": file.name,
            "folder_id": file.folder_id
        }
    }), 200


### Copy File ###
@file_bp.route("/<int:file_id>/copy", methods=["POST"])
def copy_file(file_id):
    # 1. Check login
    current_session = get_current_session()

    if not current_session:
        return jsonify({
            "error": "Not logged in"
        }), 401

    user_id = current_session.user_id

    # 2. Check user
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({
            "error": "User not found"
        }), 401

    # 3. Check email verification
    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }), 403

    # 4. Find the original file belonging to this user
    original_file = File.query.filter_by(
        id=file_id,
        user_id=user_id
    ).first()

    if not original_file:
        return jsonify({
            "error": "File not found"
        }), 404

    # 5. Validate request data
    data = request.get_json(silent=True)

    if not isinstance(data, dict) or "folder_id" not in data:
        return jsonify({
            "error": "A valid folder_id is required. Use null for the root directory."
        }), 400

    folder_id = data["folder_id"]

    # 6. Validate destination folder ID
    if folder_id is not None:
        if type(folder_id) is not int or folder_id <= 0:
            return jsonify({
                "error": "folder_id must be a positive integer or null"
            }), 400

        folder = Folder.query.filter_by(
            id=folder_id,
            user_id=user_id
        ).first()

        if not folder:
            return jsonify({
                "error": "Destination folder not found"
            }), 404

    # 7. Generate a unique visible filename
    new_name = get_unique_file_name(
        original_file.name,
        user_id,
        folder_id
    )

    # 8. Locate the original physical file
    storage_folder = os.path.join(
        current_app.instance_path,
        "uploads"
    )

    original_path = os.path.join(
        storage_folder,
        original_file.stored_name
    )

    if not os.path.isfile(original_path):
        return jsonify({
            "error": "Physical file not found"
        }), 404

    # 9. Generate a separate physical filename
    extension = os.path.splitext(original_file.stored_name)[1]
    new_stored_name = f"{uuid.uuid4().hex}{extension}"

    new_path = os.path.join(
        storage_folder,
        new_stored_name
    )

    # 10. Copy the physical file and create its database record
    try:
        shutil.copy2(original_path, new_path)

        copied_file = File(
            name=new_name,
            stored_name=new_stored_name,
            size=os.path.getsize(new_path),
            file_type=original_file.file_type,
            user_id=user_id,
            folder_id=folder_id
        )

        db.session.add(copied_file)
        db.session.commit()

    except Exception:
        db.session.rollback()

        # Remove the copied physical file if an error occurs
        try:
            if os.path.isfile(new_path):
                os.remove(new_path)
        except OSError:
            current_app.logger.exception(
                "Failed to clean up copied physical file"
            )

        current_app.logger.exception("Failed to copy file")

        return jsonify({
            "error": "Failed to copy file"
        }), 500

    # 11. Return success
    return jsonify({
        "message": "File copied successfully",
        "file": {
            "id": copied_file.id,
            "name": copied_file.name,
            "size": copied_file.size,
            "folder_id": copied_file.folder_id,
            "file_type": copied_file.file_type
        }
    }), 201



### Storage ###
@file_bp.route("/storage", methods=["GET"])
def get_storage_info():
    current_session = get_current_session()

    if not current_session:
        return jsonify({"error": "Not logged in"}), 401

    user_id = current_session.user_id
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 401

    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }), 403

    try:
        # Calculate the user's active file storage.
        user_used_bytes = (
            db.session.query(
                db.func.coalesce(db.func.sum(File.size), 0)
            )
            .filter(
                File.user_id == user_id,
                File.deleted_at.is_(None)
            )
            .scalar()
        )

        # Measure the filesystem containing uploaded files.
        storage_folder = os.path.join(
            current_app.instance_path,
            "uploads"
        )

        os.makedirs(storage_folder, mode=0o700, exist_ok=True)

        disk = shutil.disk_usage(storage_folder)

        disk_total_bytes = disk.total
        disk_used_bytes = disk.used
        disk_free_bytes = disk.free

        # Estimate space used by everything besides this user's active files.
        other_used_bytes = max(
            0,
            disk_used_bytes - user_used_bytes
        )

        # Combined MyCloud system usage estimate.
        mycloud_system_used_bytes = (
            user_used_bytes + other_used_bytes
        )

        return jsonify({
            "user_storage": {
                "used_bytes": user_used_bytes
            },
            "disk_storage": {
                "total_bytes": disk_total_bytes,
                "used_bytes": disk_used_bytes,
                "available_bytes": disk_free_bytes
            },
            "other_storage": {
                "used_bytes": other_used_bytes
            },
            "mycloud_system_storage": {
                "used_bytes": mycloud_system_used_bytes
            }
        }), 200

    except Exception:
        current_app.logger.exception(
            "Failed to retrieve storage information"
        )

        return jsonify({
            "error": "Unable to retrieve storage information"
        }), 500