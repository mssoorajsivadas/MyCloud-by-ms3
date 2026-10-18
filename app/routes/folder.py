import os
import shutil
import uuid
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from app.utils.session import get_current_session
from app.extensions import db
from app.models.folder import Folder
from flask import current_app
from app.models.file import File
from app.models.user import User
from app.utils.email_verification import is_verification_grace_period_expired
from werkzeug.utils import secure_filename
from app.services.file_service import (
    get_unique_file_name,
    detect_file_type,
    create_thumbnail,
)

folder_bp = Blueprint("folder", __name__, url_prefix="/api/folders")


### Create Folder ###
@folder_bp.route("/", methods=["POST"])
def create_folder():
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

    # 4. Validate request data
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "Invalid request data"
        }), 400

    name = data.get("name")
    parent_id = data.get("parent_id")

    # 5. Validate folder name
    if not isinstance(name, str) or not name.strip():
        return jsonify({
            "error": "Folder name is required"
        }), 400

    name = name.strip()

    if len(name) > 255:
        return jsonify({
            "error": "Folder name cannot exceed 255 characters"
        }), 400

    # 6. Validate parent folder ID
    if parent_id is not None:
        if type(parent_id) is not int or parent_id <= 0:
            return jsonify({
                "error": "parent_id must be a positive integer or null"
            }), 400

        parent_folder = Folder.query.filter_by(
            id=parent_id,
            user_id=user_id
        ).filter(
            Folder.deleted_at.is_(None)
        ).first()

        if not parent_folder:
            return jsonify({
                "error": "Parent folder not found"
            }), 404

    # 7. Generate a unique folder name
    name = get_unique_folder_name(
        name,
        user_id,
        parent_id
    )

    # 8. Create folder
    try:
        folder = Folder(
            name=name,
            user_id=user_id,
            parent_id=parent_id
        )

        db.session.add(folder)
        db.session.commit()

    except Exception:
        db.session.rollback()

        current_app.logger.exception("Failed to create folder")

        return jsonify({
            "error": "Failed to create folder"
        }), 500

    # 9. Return success
    return jsonify({
        "message": "Folder created successfully",
        "folder": {
            "id": folder.id,
            "name": folder.name,
            "parent_id": folder.parent_id
        }
    }), 201



### Folder Upload ###
@folder_bp.route("/upload", methods=["POST"])
def upload_folder():
    # 1. Check login
    current_session = get_current_session()

    if not current_session:
        return jsonify({"error": "Not logged in"}), 401

    user_id = current_session.user_id

    # 2. Check user
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 401

    # 3. Check email verification BEFORE creating folders or files
    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }), 403

    # 4. Read uploaded files and their relative paths
    uploaded_files = request.files.getlist("files")
    relative_paths = request.form.getlist("relative_paths")

    if not uploaded_files:
        return jsonify({"error": "No files were provided"}), 400

    if len(uploaded_files) != len(relative_paths):
        return jsonify({
            "error": "Each file must have a corresponding relative path"
        }), 400

    # 5. Validate the destination folder
    raw_parent_id = request.form.get("parent_id")
    parent_id = None

    if raw_parent_id not in (None, ""):
        try:
            parent_id = int(raw_parent_id)

            if parent_id <= 0:
                raise ValueError

        except (ValueError, TypeError):
            return jsonify({
                "error": "parent_id must be a positive integer or empty"
            }), 400

        parent_folder = Folder.query.filter(
            Folder.id == parent_id,
            Folder.user_id == user_id,
            Folder.deleted_at.is_(None)
        ).first()

        if not parent_folder:
            return jsonify({"error": "Destination folder not found"}), 404

    # 6. Validate every relative path before modifying anything
    validated_files = []
    folder_paths = set()

    for uploaded_file, raw_path in zip(uploaded_files, relative_paths):
        if not uploaded_file.filename:
            return jsonify({"error": "An uploaded file has no filename"}), 400

        if not isinstance(raw_path, str) or not raw_path.strip():
            return jsonify({"error": "Invalid relative path"}), 400

        # Support browser paths using either slash style.
        normalized_path = raw_path.replace("\\", "/")

        # Reject absolute paths, Windows drive paths and traversal.
        if (
            normalized_path.startswith("/")
            or "\x00" in normalized_path
            or ":" in normalized_path.split("/")[0]
        ):
            return jsonify({"error": "Invalid relative path"}), 400

        parts = normalized_path.split("/")

        if len(parts) < 2 or any(part in ("", ".", "..") for part in parts):
            return jsonify({
                "error": "Each file must be inside an uploaded folder"
            }), 400

        safe_parts = [secure_filename(part) for part in parts]

        if any(not part for part in safe_parts):
            return jsonify({
                "error": "A folder or filename contains an invalid name"
            }), 400

        if any(len(part) > 255 for part in safe_parts):
            return jsonify({
                "error": "A folder or filename exceeds 255 characters"
            }), 400

        # Every component except the last is a folder.
        for index in range(1, len(safe_parts)):
            folder_paths.add(tuple(safe_parts[:index]))

        validated_files.append({
            "file": uploaded_file,
            "parts": safe_parts,
        })

    # Create parent folders before child folders.
    ordered_folder_paths = sorted(
        folder_paths,
        key=lambda path: (len(path), path)
    )

    # Track physical files for cleanup if the operation fails.
    created_paths = []
    created_folder_ids = {}

    upload_dir = os.path.join(current_app.instance_path, "uploads")
    os.makedirs(upload_dir, mode=0o700, exist_ok=True)
    os.chmod(upload_dir, 0o700)

    try:
        # 7. Create the required folder tree.
        for path_parts in ordered_folder_paths:
            folder_name = path_parts[-1]
            parent_path = path_parts[:-1]

            if parent_path:
                destination_parent_id = created_folder_ids[parent_path]
            else:
                destination_parent_id = parent_id

            unique_name = get_unique_folder_name(
                folder_name,
                user_id,
                destination_parent_id
            )

            folder = Folder(
                name=unique_name,
                user_id=user_id,
                parent_id=destination_parent_id
            )

            db.session.add(folder)
            db.session.flush()

            created_folder_ids[path_parts] = folder.id

        # 8. Save each file and create its database record.
        uploaded_results = []

        for item in validated_files:
            uploaded_file = item["file"]
            parts = item["parts"]

            folder_path = tuple(parts[:-1])
            destination_folder_id = created_folder_ids[folder_path]
            original_name = parts[-1]

            extension = os.path.splitext(original_name)[1]
            stored_name = f"{uuid.uuid4().hex}{extension}"
            file_path = os.path.join(upload_dir, stored_name)

            # Save and track the physical file.
            uploaded_file.save(file_path)
            created_paths.append(file_path)
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

            if thumbnail_name:
                thumbnail_path = os.path.join(
                    current_app.instance_path,
                    "thumbnails",
                    thumbnail_name
                )
                created_paths.append(thumbnail_path)

            unique_file_name = get_unique_file_name(
                original_name,
                user_id,
                destination_folder_id
            )

            file_record = File(
                name=unique_file_name,
                stored_name=stored_name,
                size=size,
                file_type=file_type,
                thumbnail_name=thumbnail_name,
                user_id=user_id,
                folder_id=destination_folder_id
            )

            db.session.add(file_record)
            db.session.flush()

            uploaded_results.append({
                "id": file_record.id,
                "name": file_record.name,
                "folder_id": file_record.folder_id,
                "size": file_record.size,
            })

        # 9. Commit the folder tree and file records together.
        db.session.commit()

    except Exception:
        db.session.rollback()

        # Remove files and thumbnails created by this request.
        for path in reversed(created_paths):
            try:
                if os.path.isfile(path):
                    os.remove(path)
            except OSError:
                current_app.logger.exception(
                    "Failed to clean up folder upload file: %s",
                    path
                )

        current_app.logger.exception("Folder upload failed")

        return jsonify({
            "error": "Folder upload failed. Please try again."
        }), 500

    # 10. Return the result.
    return jsonify({
        "message": "Folder uploaded successfully",
        "folder_count": len(created_folder_ids),
        "file_count": len(uploaded_results),
        "files": uploaded_results,
    }), 201



### Folder info ###
@folder_bp.route("/", methods=["GET"])
def get_folders():
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

    # 4. Read and validate parent_id
    raw_parent_id = request.args.get("parent_id")

    if raw_parent_id is None:
        # No parent_id means the root directory
        parent_id = None

    else:
        try:
            parent_id = int(raw_parent_id)

            if parent_id <= 0:
                raise ValueError

        except (ValueError, TypeError):
            return jsonify({
                "error": "Invalid parent folder ID"
            }), 400

        # 5. Make sure the parent folder belongs to this user
        parent_folder = Folder.query.filter_by(
            id=parent_id,
            user_id=user_id
        ).filter(
            Folder.deleted_at.is_(None)
        ).first()

        if not parent_folder:
            return jsonify({
                "error": "Parent folder not found"
            }), 404

    # 6. Get this user's folders under the requested parent
    folders = Folder.query.filter(
        Folder.user_id == user_id,
        Folder.parent_id == parent_id,
        Folder.deleted_at.is_(None)
    ).order_by(
        Folder.name.asc()
    ).all()

    # 7. Return the folders
    return jsonify([
        {
            "id": folder.id,
            "name": folder.name,
            "parent_id": folder.parent_id
        }
        for folder in folders
    ]), 200


### Rename Folder ###
@folder_bp.route("/<int:folder_id>", methods=["PATCH"])
def rename_folder(folder_id):

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

    # Find the folder belonging to the logged-in user
    folder = Folder.query.filter_by(
        id=folder_id,
        user_id=user_id
    ).first()

    if not folder:
        return jsonify({
            "error": "Folder not found"
        }), 404

    # Read the request body
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "Invalid request data"
        }), 400

    name = data.get("name")

    # Validate the folder name
    if not isinstance(name, str) or not name.strip():
        return jsonify({
            "error": "Folder name is required"
        }), 400

    name = name.strip()

    # Check whether another active folder already has this name
    existing_folder = Folder.query.filter(
        Folder.user_id == user_id,
        Folder.parent_id == folder.parent_id,
        Folder.name == name,
        Folder.id != folder.id,
        Folder.deleted_at.is_(None)
    ).first()

    if existing_folder:
        return jsonify({
            "error": "A folder with this name already exists"
        }), 409

    # Rename the folder
    folder.name = name

    db.session.commit()

    return jsonify({
        "message": "Folder renamed successfully",
        "folder": {
            "id": folder.id,
            "name": folder.name,
            "parent_id": folder.parent_id
        }
    }), 200


### Move Folder ###
@folder_bp.route("/<int:folder_id>/move", methods=["PATCH"])
def move_folder(folder_id):

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

    # Find a folder owned by the current user.
    folder = Folder.query.filter_by(
        id=folder_id,
        user_id=user_id
    ).first()

    if not folder:
        return jsonify({
            "error": "Folder not found"
        }), 404

    # Read and validate the request body.
    data = request.get_json(silent=True)

    if not isinstance(data, dict) or "parent_id" not in data:
        return jsonify({
            "error": "A valid parent_id is required"
        }), 400

    parent_id = data["parent_id"]

    # Allow null for the root, or an integer folder ID.
    # bool is rejected explicitly because bool is a subclass of int in Python.
    if parent_id is not None and (
        type(parent_id) is not int or parent_id <= 0
    ):
        return jsonify({
            "error": "parent_id must be a positive integer or null"
        }), 400

    # Prevent moving a folder into itself.
    if parent_id == folder.id:
        return jsonify({
            "error": "A folder cannot be moved into itself"
        }), 400

    # Prevent unnecessary moves to the current location.
    if parent_id == folder.parent_id:
        return jsonify({
            "error": "Folder is already in this location"
        }), 400

    # Validate destination ownership and prevent moving into descendants.
    error = validate_folder_destination(
        folder,
        parent_id,
        user_id
    )

    if error:
        return jsonify({
            "error": error
        }), 400

    # Avoid duplicate names in the destination.
    new_name = get_unique_folder_name(
        folder.name,
        user_id,
        parent_id
    )

    folder.name = new_name
    folder.parent_id = parent_id

    db.session.commit()

    return jsonify({
        "message": "Folder moved successfully",
        "folder": {
            "id": folder.id,
            "name": folder.name,
            "parent_id": folder.parent_id
        }
    }), 200



### Copy Folder ###
@folder_bp.route("/<int:folder_id>/copy", methods=["POST"])
def copy_folder(folder_id):

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

    # Find the source folder belonging to this user.
    folder = Folder.query.filter_by(
        id=folder_id,
        user_id=user_id
    ).first()

    if not folder:
        return jsonify({
            "error": "Folder not found"
        }), 404

    # Validate request data.
    data = request.get_json(silent=True)

    if not isinstance(data, dict) or "parent_id" not in data:
        return jsonify({
            "error": "A valid parent_id is required"
        }), 400

    parent_id = data["parent_id"]

    if parent_id is not None and (
        type(parent_id) is not int or parent_id <= 0
    ):
        return jsonify({
            "error": "parent_id must be a positive integer or null"
        }), 400

    # Validate destination ownership and folder hierarchy.
    error = validate_folder_destination(
        folder,
        parent_id,
        user_id
    )

    if error:
        return jsonify({
            "error": error
        }), 400

    # Track newly created physical files so they can be cleaned up
    # if the copy operation fails.
    created_paths = []

    try:
        copied_folder = copy_folder_tree(
            folder,
            parent_id,
            user_id,
            created_paths
        )

        db.session.commit()

    except Exception:
        db.session.rollback()

        # Remove physical copies created by this operation.
        for path in created_paths:
            try:
                if os.path.isfile(path):
                    os.remove(path)
            except OSError:
                current_app.logger.exception(
                    "Failed to clean up copied file: %s", path
                )

        current_app.logger.exception("Folder copy failed")

        return jsonify({
            "error": "Could not copy folder. Please try again."
        }), 500

    return jsonify({
        "message": "Folder copied successfully",
        "folder": {
            "id": copied_folder.id,
            "name": copied_folder.name,
            "parent_id": copied_folder.parent_id
        }
    }), 201



### Delete Folder ###
@folder_bp.route("/<int:folder_id>", methods=["DELETE"])
def delete_folder(folder_id):
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

    # 4. Find the folder belonging to this user
    folder = Folder.query.filter_by(
        id=folder_id,
        user_id=user_id
    ).first()

    if not folder or folder.deleted_at is not None:
        return jsonify({
            "error": "Folder not found"
        }), 404

    # 5. Move the folder tree to Trash
    try:
        deleted_at = datetime.now(timezone.utc)

        delete_folder_tree(folder, user_id, deleted_at)

        db.session.commit()

    except Exception:
        db.session.rollback()

        current_app.logger.exception(
            "Failed to move folder to Trash"
        )

        return jsonify({
            "error": "Failed to move folder to Trash"
        }), 500

    # 6. Return success
    return jsonify({
        "message": "Folder moved to Trash successfully"
    }), 200



###  Delete Folder Tree ###
def delete_folder_tree(folder, user_id, deleted_at):
    # 1. Verify folder ownership
    if folder.user_id != user_id:
        raise ValueError("Folder ownership mismatch")

    # 2. Mark active files inside this folder as deleted
    files = File.query.filter_by(
        folder_id=folder.id,
        user_id=user_id
    ).all()

    for file in files:
        if file.deleted_at is None:
            file.deleted_at = deleted_at

    # 3. Find child folders, including ones already in Trash
    children = Folder.query.filter_by(
        parent_id=folder.id,
        user_id=user_id
    ).all()

    # 4. Recursively process every child folder
    for child in children:
        delete_folder_tree(child, user_id, deleted_at)

    # 5. Mark this folder as deleted only if it isn't already
    if folder.deleted_at is None:
        folder.deleted_at = deleted_at



### Get Unique Name ###
def get_unique_folder_name(name, user_id, parent_id):
    new_name = name
    number = 1

    while Folder.query.filter(
        Folder.name == new_name,
        Folder.user_id == user_id,
        Folder.parent_id == parent_id,
        Folder.deleted_at.is_(None)
    ).first():

        new_name = f"{name} ({number})"
        number += 1

    return new_name



### Folder Validater ###
def validate_folder_destination(folder, new_parent_id, user_id):

    if new_parent_id is None:
        return None

    destination = Folder.query.filter_by(
        id=new_parent_id,
        user_id=user_id
    ).first()

    if not destination:
        return "Destination folder not found"

    current = destination

    while current is not None:

        if current.id == folder.id:
            return "Cannot move or copy folder into its own descendant"

        if current.parent_id is None:
            break

        current = Folder.query.filter_by(
            id=current.parent_id,
            user_id=user_id
        ).first()

    return None



### Folder Tree Get ###
def copy_folder_tree(
    folder,
    new_parent_id,
    user_id,
    created_paths=None
):
    if created_paths is None:
        created_paths = []

    # Safety check: only copy folders owned by this user.
    if folder.user_id != user_id:
        raise ValueError("Folder ownership mismatch")

    # Create a uniquely named copy of this folder.
    new_name = get_unique_folder_name(
        folder.name,
        user_id,
        new_parent_id
    )

    copied_folder = Folder(
        name=new_name,
        user_id=user_id,
        parent_id=new_parent_id
    )

    db.session.add(copied_folder)
    db.session.flush()

    # Storage directory used by the existing upload system.
    upload_dir = os.path.join(
        current_app.instance_path,
        "uploads"
    )

    # Find files directly inside the source folder.
    files = File.query.filter_by(
        folder_id=folder.id,
        user_id=user_id
    ).all()

    for file in files:

        source_path = os.path.join(
            upload_dir,
            file.stored_name
        )

        # Do not create a database record for a missing file.
        if not os.path.isfile(source_path):
            raise FileNotFoundError(
                f"Source file is missing: {file.id}"
            )

        # Generate a different storage name for the copy.
        new_stored_name = uuid.uuid4().hex

        destination_path = os.path.join(
            upload_dir,
            new_stored_name
        )

        shutil.copy2(source_path, destination_path)
        created_paths.append(destination_path)

        # Create a new database record for the copied file.
        copied_file = File(
            name=file.name,
            stored_name=new_stored_name,
            size=file.size,
            file_type=file.file_type,
            user_id=user_id,
            folder_id=copied_folder.id
        )

        db.session.add(copied_file)

    # Find and recursively copy child folders.
    children = Folder.query.filter_by(
        parent_id=folder.id,
        user_id=user_id
    ).all()

    for child in children:
        copy_folder_tree(
            child,
            copied_folder.id,
            user_id,
            created_paths
        )

    return copied_folder