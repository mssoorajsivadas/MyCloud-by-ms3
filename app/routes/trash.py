import os
from flask import Blueprint, jsonify, current_app, request
from app import db
from datetime import datetime, timezone
from app.models.file import File
from app.models.user import User
from app.models.folder import Folder
from app.routes.auth import get_current_session
from app.utils.email_verification import is_verification_grace_period_expired

trash_bp = Blueprint(
    "trash",
    __name__,
    url_prefix="/api/trash"
)


### Trash list ###
@trash_bp.route("/", methods=["GET"])
def list_trash():
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

    # 4. Get deleted folders belonging to this user
    deleted_folders = Folder.query.filter(
        Folder.user_id == user_id,
        Folder.deleted_at.isnot(None)
    ).all()

    # 5. Get deleted files belonging to this user
    deleted_files = File.query.filter(
        File.user_id == user_id,
        File.deleted_at.isnot(None)
    ).all()

    # 6. Find deleted folders whose parent is not deleted.
    # These are the top-level deleted folders shown in Trash.
    deleted_folder_ids = {
        folder.id for folder in deleted_folders
    }

    trash_folders = []

    for folder in deleted_folders:
        parent_is_deleted = folder.parent_id in deleted_folder_ids

        if not parent_is_deleted:
            trash_folders.append({
                "id": folder.id,
                "name": folder.name,
                "type": "folder",
                "deleted_at": folder.deleted_at.isoformat()
            })

    # 7. Include deleted files that aren't inside a deleted folder.
    trash_files = []

    for file in deleted_files:
        parent_is_deleted = file.folder_id in deleted_folder_ids

        if not parent_is_deleted:
            trash_files.append({
                "id": file.id,
                "name": file.name,
                "type": "file",
                "file_type": file.file_type,
                "thumbnail_name": file.thumbnail_name,
                "folder_id": file.folder_id,
                "deleted_at": file.deleted_at.isoformat()
            })

    # 8. Return Trash contents
    return jsonify({
        "items": trash_folders + trash_files
    }), 200


### Trashed folder contents ###
@trash_bp.route("/folder/<int:folder_id>", methods=["GET"])
def get_trashed_folder_contents(folder_id):
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

    # 4. Find the trashed folder belonging to this user
    folder = Folder.query.filter(
        Folder.id == folder_id,
        Folder.user_id == user_id,
        Folder.deleted_at.isnot(None)
    ).first()

    if not folder:
        return jsonify({
            "error": "Trashed folder not found"
        }), 404

    # 5. Get immediate subfolders that are in Trash
    subfolders = Folder.query.filter(
        Folder.user_id == user_id,
        Folder.parent_id == folder_id,
        Folder.deleted_at.isnot(None)
    ).order_by(
        Folder.name.asc()
    ).all()

    # 6. Get immediate files that are in Trash
    files = File.query.filter(
        File.user_id == user_id,
        File.folder_id == folder_id,
        File.deleted_at.isnot(None)
    ).order_by(
        File.name.asc()
    ).all()

    # 7. Prepare the response
    items = []

    for subfolder in subfolders:
        items.append({
            "id": subfolder.id,
            "name": subfolder.name,
            "type": "folder",
            "parent_id": subfolder.parent_id,
            "deleted_at": (
                subfolder.deleted_at.isoformat()
                if subfolder.deleted_at else None
            )
        })

    for file in files:
        items.append({
            "id": file.id,
            "name": file.name,
            "type": "file",
            "file_type": file.file_type,
            "thumbnail_name": file.thumbnail_name,
            "folder_id": file.folder_id,
            "deleted_at": (
                file.deleted_at.isoformat()
                if file.deleted_at else None
            )
        })
    return jsonify({
        "folder": {
            "id": folder.id,
            "name": folder.name,
            "parent_id": folder.parent_id
        },
        "items": items
    }), 200


### Restore Selected item ###
@trash_bp.route("/restore", methods=["POST"])
def restore_selected_items():
    # 1. Check login
    current_session = get_current_session()

    if not current_session:
        return jsonify({"error": "Not logged in"}), 401

    user_id = current_session.user_id

    # 2. Check user
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 401

    # 3. Check email verification
    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }), 403

    # 4. Validate the request
    data = request.get_json(silent=True) or {}
    items = data.get("items")

    if not isinstance(items, list) or not items:
        return jsonify({"error": "No items selected"}), 400

    selected = set()

    for item in items:
        if not isinstance(item, dict):
            return jsonify({"error": "Invalid item format"}), 400

        item_type = item.get("type")
        item_id = item.get("id")

        if item_type not in ("file", "folder"):
            return jsonify({"error": "Invalid item type"}), 400

        if (
            isinstance(item_id, bool)
            or not isinstance(item_id, int)
            or item_id <= 0
        ):
            return jsonify({"error": "Invalid item ID"}), 400

        selected.add((item_type, item_id))

    # 5. Find and validate all explicitly selected items
    files = {}
    folders = {}

    for item_type, item_id in selected:
        if item_type == "file":
            item = File.query.filter(
                File.id == item_id,
                File.user_id == user_id,
                File.deleted_at.isnot(None)
            ).first()

            if not item:
                return jsonify({
                    "error": "Trashed file not found",
                    "id": item_id
                }), 404

            files[item.id] = item

        else:
            item = Folder.query.filter(
                Folder.id == item_id,
                Folder.user_id == user_id,
                Folder.deleted_at.isnot(None)
            ).first()

            if not item:
                return jsonify({
                    "error": "Trashed folder not found",
                    "id": item_id
                }), 404

            folders[item.id] = item

    # 6. Restore everything in one database transaction
    restored_files = []
    restored_folders = []

    try:
        # Restore explicitly selected folders first.
        # Their helper restores the associated folder tree.
        for folder in folders.values():
            # A parent selected earlier may already have restored it.
            if folder.deleted_at is None:
                continue

            deletion_time = folder.deleted_at

            if folder.parent_id is not None:
                parent = db.session.get(Folder, folder.parent_id)

                if (
                    parent is None
                    or parent.user_id != user_id
                    or (
                        parent.deleted_at is not None
                        and parent.id not in folders
                    )
                ):
                    raise ValueError(
                        f"Parent folder unavailable: {folder.id}"
                    )

            restore_folder_tree(folder, user_id, deletion_time)

        # Restore explicitly selected files that remain in Trash.
        for file in files.values():
            if file.deleted_at is None:
                continue

            if file.folder_id is not None:
                folder = db.session.get(Folder, file.folder_id)

                if (
                    folder is None
                    or folder.user_id != user_id
                    or folder.deleted_at is not None
                ):
                    raise ValueError(
                        f"Original folder unavailable: {file.id}"
                    )

            existing_file = File.query.filter(
                File.user_id == user_id,
                File.folder_id == file.folder_id,
                File.name == file.name,
                File.deleted_at.is_(None)
            ).first()

            if existing_file:
                raise ValueError(
                    f"A file named '{file.name}' already exists"
                )

            file.deleted_at = None

        # Validate selected folders' destination names.
        for folder in folders.values():
            if folder.deleted_at is not None:
                continue

            existing_folder = Folder.query.filter(
                Folder.user_id == user_id,
                Folder.parent_id == folder.parent_id,
                Folder.name == folder.name,
                Folder.deleted_at.is_(None),
                Folder.id != folder.id
            ).first()

            if existing_folder:
                raise ValueError(
                    f"A folder named '{folder.name}' already exists"
                )

        db.session.flush()

        # Build the response after restoration.
        for file in files.values():
            if file.deleted_at is None:
                restored_files.append({
                    "id": file.id,
                    "name": file.name,
                    "folder_id": file.folder_id
                })

        for folder in folders.values():
            if folder.deleted_at is None:
                restored_folders.append({
                    "id": folder.id,
                    "name": folder.name,
                    "parent_id": folder.parent_id
                })

        db.session.commit()

    except ValueError as error:
        db.session.rollback()

        return jsonify({
            "error": "Unable to restore selected items",
            "message": str(error)
        }), 409

    except Exception:
        db.session.rollback()
        current_app.logger.exception(
            "Failed to restore selected Trash items"
        )

        return jsonify({
            "error": "Failed to restore selected items"
        }), 500

    return jsonify({
        "message": "Selected items restored successfully",
        "files": restored_files,
        "folders": restored_folders
    }), 200



### Restore File ###
@trash_bp.route("/file/<int:file_id>/restore", methods=["POST"])
def restore_file(file_id):
    # 1. Check login
    current_session = get_current_session()

    if not current_session:
        return jsonify({"error": "Not logged in"}), 401

    user_id = current_session.user_id

    # 2. Check user
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 401

    # 3. Check email verification
    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }), 403

    # 4. Find the trashed file belonging to this user
    file = File.query.filter(
        File.id == file_id,
        File.user_id == user_id,
        File.deleted_at.isnot(None)
    ).first()

    if not file:
        return jsonify({"error": "Trashed file not found"}), 404

    # 5. Make sure the original folder is still active
    if file.folder_id is not None:
        folder = Folder.query.filter(
            Folder.id == file.folder_id,
            Folder.user_id == user_id,
            Folder.deleted_at.is_(None)
        ).first()

        if not folder:
            return jsonify({
                "error": "Original folder is unavailable",
                "message": "Restore the containing folder first."
            }), 409

    # 6. Check for a duplicate active filename
    existing_file = File.query.filter(
        File.user_id == user_id,
        File.folder_id == file.folder_id,
        File.name == file.name,
        File.deleted_at.is_(None)
    ).first()

    if existing_file:
        return jsonify({
            "error": "A file with this name already exists",
            "message": "Rename the existing file or move it before restoring."
        }), 409

    # 7. Restore the file
    try:
        file.deleted_at = None
        db.session.commit()

    except Exception:
        db.session.rollback()
        current_app.logger.exception("Failed to restore file")

        return jsonify({
            "error": "Failed to restore file"
        }), 500

    return jsonify({
        "message": "File restored successfully",
        "file": {
            "id": file.id,
            "name": file.name,
            "folder_id": file.folder_id
        }
    }), 200


### Restore folder ###
@trash_bp.route(
    "/folder/<int:folder_id>/restore",
    methods=["POST"]
)
def restore_folder(folder_id):
    # Authenticate the user.
    current_session = get_current_session()

    if not current_session:
        return jsonify({"error": "Authentication required"}), 401

    user_id = current_session.user_id

    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 404

    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "Email verification required"
        }), 403

    # Find the selected trashed folder owned by this user.
    folder = Folder.query.filter(
        Folder.id == folder_id,
        Folder.user_id == user_id,
        Folder.deleted_at.isnot(None)
    ).first()

    if not folder:
        return jsonify({
            "error": "Trashed folder not found"
        }), 404

    # If this folder has a parent, require that parent to be active.
    # This prevents restoring a child into a still-trashed parent.
    if folder.parent_id is not None:
        parent = Folder.query.filter(
            Folder.id == folder.parent_id,
            Folder.user_id == user_id,
            Folder.deleted_at.is_(None)
        ).first()

        if not parent:
            return jsonify({
                "error": "Parent folder is in Trash",
                "message": "Restore the parent folder first."
            }), 409

    deletion_time = folder.deleted_at

    try:
        restore_folder_tree(folder, user_id, deletion_time)
        db.session.commit()

    except Exception:
        db.session.rollback()

        current_app.logger.exception(
            "Failed to restore folder"
        )

        return jsonify({
            "error": "Failed to restore folder"
        }), 500

    return jsonify({
        "message": "Folder restored successfully",
        "folder": {
            "id": folder.id,
            "name": folder.name,
            "parent_id": folder.parent_id
        }
    }), 200



### Restore folder tree helper ###
def restore_folder_tree(folder, user_id, deletion_time):
    """
    Restore a folder tree that was moved to Trash together.

    Items with a different deleted_at timestamp remain in Trash.
    """
    if folder.user_id != user_id:
        raise ValueError("Folder ownership mismatch")

    # Restore the selected folder only if it belongs to this deletion.
    if folder.deleted_at != deletion_time:
        return

    folder.deleted_at = None

    # Restore files directly inside this folder that share its
    # deletion timestamp.
    files = File.query.filter_by(
        folder_id=folder.id,
        user_id=user_id
    ).filter(
        File.deleted_at == deletion_time
    ).all()

    for file in files:
        file.deleted_at = None

    # Process child folders deleted at the same time.
    children = Folder.query.filter_by(
        parent_id=folder.id,
        user_id=user_id
    ).filter(
        Folder.deleted_at == deletion_time
    ).all()

    for child in children:
        restore_folder_tree(child, user_id, deletion_time)



### Permanenr delete for selected item ###
@trash_bp.route("/permanent", methods=["DELETE"])
def permanently_delete_selected_items():
    # Check the current session
    current_session = get_current_session()

    if not current_session:
        return jsonify({"error": "Authentication required"}), 401

    user_id = current_session.user_id

    # Check the user
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 404

    if is_verification_grace_period_expired(user):
        return jsonify({"error": "Email verification required"}), 403

    data = request.get_json(silent=True) or {}
    items = data.get("items")

    if not isinstance(items, list) or not items:
        return jsonify({
            "error": "Select at least one item to delete"
        }), 400

    # Validate the selection before deleting anything
    selected_files = []
    selected_folders = []
    seen = set()

    for item in items:
        if not isinstance(item, dict):
            return jsonify({"error": "Invalid item"}), 400

        item_type = item.get("type")
        item_id = item.get("id")

        if item_type not in ("file", "folder"):
            return jsonify({"error": "Invalid item type"}), 400

        if isinstance(item_id, bool) or not isinstance(item_id, int) or item_id <= 0:
            return jsonify({"error": "Invalid item ID"}), 400

        key = (item_type, item_id)

        if key in seen:
            continue

        seen.add(key)

        if item_type == "file":
            file = File.query.filter(
                File.id == item_id,
                File.user_id == user_id,
                File.deleted_at.isnot(None)
            ).first()

            if not file:
                return jsonify({
                    "error": f"Trashed file {item_id} not found"
                }), 404

            selected_files.append(file)

        else:
            folder = Folder.query.filter(
                Folder.id == item_id,
                Folder.user_id == user_id,
                Folder.deleted_at.isnot(None)
            ).first()

            if not folder:
                return jsonify({
                    "error": f"Trashed folder {item_id} not found"
                }), 404

            selected_folders.append(folder)

    try:
        uploads_dir = os.path.realpath(
            os.path.join(current_app.instance_path, "uploads")
        )

        # Collect files inside the selected folders
        files_to_delete = {
            file.id: file for file in selected_files
        }

        folders_to_delete = {}

        def collect_folder_contents(folder):
            if folder.id in folders_to_delete:
                return

            folders_to_delete[folder.id] = folder

            for file in File.query.filter_by(
                folder_id=folder.id,
                user_id=user_id
            ).all():
                files_to_delete[file.id] = file

            children = Folder.query.filter_by(
                parent_id=folder.id,
                user_id=user_id
            ).all()

            for child in children:
                collect_folder_contents(child)

        for folder in selected_folders:
            collect_folder_contents(folder)

        # Remove physical files, ensuring paths stay inside uploads
        for file in files_to_delete.values():
            file_path = os.path.realpath(
                os.path.join(uploads_dir, file.stored_name)
            )

            if os.path.commonpath([uploads_dir, file_path]) != uploads_dir:
                raise ValueError("Invalid stored file path")

            if os.path.isfile(file_path):
                os.remove(file_path)

        # Delete file records
        for file in files_to_delete.values():
            db.session.delete(file)

        # Delete folders from deepest to shallowest
        for folder in sorted(
            folders_to_delete.values(),
            key=lambda folder: folder.id,
            reverse=True
        ):
            db.session.delete(folder)

        db.session.commit()

    except Exception:
        db.session.rollback()

        current_app.logger.exception(
            "Failed to permanently delete selected items"
        )

        return jsonify({
            "error": "Failed to permanently delete selected items"
        }), 500

    return jsonify({
        "message": "Selected items permanently deleted",
        "files_deleted": len(files_to_delete),
        "folders_deleted": len(folders_to_delete)
    }), 200



### File permanenr delete ###
@trash_bp.route("/file/<int:file_id>/permanent", methods=["DELETE"])
def permanently_delete_file(file_id):
    # Check the current session
    current_session = get_current_session()

    if not current_session:
        return jsonify({"error": "Authentication required"}), 401

    user_id = current_session.user_id

    # Check the user
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 404

    if is_verification_grace_period_expired(user):
        return jsonify({"error": "Email verification required"}), 403

    # Find the file belonging to this user and already in Trash
    file = File.query.filter(
        File.id == file_id,
        File.user_id == user_id,
        File.deleted_at.isnot(None)
    ).first()

    if not file:
        return jsonify({
            "error": "Trashed file not found"
        }), 404

    # Build the physical file path
    file_path = os.path.join(
        current_app.instance_path,
        "uploads",
        file.stored_name
    )

    try:
        # Delete the physical file if it exists
        if os.path.isfile(file_path):
            os.remove(file_path)

        # Delete the database record
        db.session.delete(file)
        db.session.commit()

    except Exception:
        db.session.rollback()
        current_app.logger.exception(
            "Failed to permanently delete file"
        )

        return jsonify({
            "error": "Failed to permanently delete file"
        }), 500

    return jsonify({
        "message": "File permanently deleted successfully"
    }), 200


### Folder permanenr delete ###
@trash_bp.route("/folder/<int:folder_id>/permanent", methods=["DELETE"])
def permanently_delete_folder(folder_id):
    # Check the current session
    current_session = get_current_session()

    if not current_session:
        return jsonify({"error": "Authentication required"}), 401

    user_id = current_session.user_id

    # Check the user
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 404

    if is_verification_grace_period_expired(user):
        return jsonify({"error": "Email verification required"}), 403

    # Find the trashed folder belonging to this user
    folder = Folder.query.filter(
        Folder.id == folder_id,
        Folder.user_id == user_id,
        Folder.deleted_at.isnot(None)
    ).first()

    if not folder:
        return jsonify({"error": "Trashed folder not found"}), 404

    try:
        # Collect all files before deleting database records
        files_to_delete = []

        def collect_folder_contents(current_folder):
            files = File.query.filter_by(
                folder_id=current_folder.id,
                user_id=user_id
            ).all()

            files_to_delete.extend(files)

            children = Folder.query.filter_by(
                parent_id=current_folder.id,
                user_id=user_id
            ).all()

            for child in children:
                collect_folder_contents(child)

        collect_folder_contents(folder)

        # Remove physical files from the uploads directory
        uploads_dir = os.path.realpath(
            os.path.join(current_app.instance_path, "uploads")
        )

        for file in files_to_delete:
            file_path = os.path.realpath(
                os.path.join(uploads_dir, file.stored_name)
            )

            # Ensure the file path stays inside the uploads directory
            if os.path.commonpath([uploads_dir, file_path]) != uploads_dir:
                raise ValueError("Invalid stored file path")

            if os.path.isfile(file_path):
                os.remove(file_path)

        # Delete all file and folder records in the selected tree
        def delete_folder_records(current_folder):
            children = Folder.query.filter_by(
                parent_id=current_folder.id,
                user_id=user_id
            ).all()

            for child in children:
                delete_folder_records(child)

            File.query.filter_by(
                folder_id=current_folder.id,
                user_id=user_id
            ).delete(synchronize_session=False)

            db.session.delete(current_folder)

        delete_folder_records(folder)
        db.session.commit()

    except Exception:
        db.session.rollback()
        current_app.logger.exception(
            "Failed to permanently delete folder"
        )

        return jsonify({
            "error": "Failed to permanently delete folder"
        }), 500

    return jsonify({
        "message": "Folder permanently deleted successfully"
    }), 200



### Empty Trash ###
@trash_bp.route("/empty", methods=["DELETE"])
def empty_trash():
    # Check the current session
    current_session = get_current_session()

    if not current_session:
        return jsonify({"error": "Authentication required"}), 401

    user_id = current_session.user_id

    # Check the user
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 404

    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "Email verification required"
        }), 403

    try:
        # Find every trashed file belonging to this user.
        trashed_files = File.query.filter(
            File.user_id == user_id,
            File.deleted_at.isnot(None)
        ).all()

        # Find every trashed folder belonging to this user.
        trashed_folders = Folder.query.filter(
            Folder.user_id == user_id,
            Folder.deleted_at.isnot(None)
        ).all()

        # Resolve the uploads directory.
        uploads_dir = os.path.realpath(
            os.path.join(current_app.instance_path, "uploads")
        )

        # Delete physical files first.
        for file in trashed_files:
            file_path = os.path.realpath(
                os.path.join(uploads_dir, file.stored_name)
            )

            # Prevent paths from escaping the uploads directory.
            if os.path.commonpath(
                [uploads_dir, file_path]
            ) != uploads_dir:
                raise ValueError("Invalid stored file path")

            if os.path.isfile(file_path):
                os.remove(file_path)

        # Remove the trashed file records.
        for file in trashed_files:
            db.session.delete(file)

        # Remove trashed folder records from deepest to shallowest.
        folder_ids = {folder.id for folder in trashed_folders}

        def folder_depth(folder):
            depth = 0
            parent_id = folder.parent_id
            visited = set()

            while parent_id in folder_ids and parent_id not in visited:
                visited.add(parent_id)
                depth += 1

                parent = next(
                    (
                        item for item in trashed_folders
                        if item.id == parent_id
                    ),
                    None
                )

                if parent is None:
                    break

                parent_id = parent.parent_id

            return depth

        trashed_folders.sort(
            key=folder_depth,
            reverse=True
        )

        for folder in trashed_folders:
            db.session.delete(folder)

        db.session.commit()

    except Exception:
        db.session.rollback()

        current_app.logger.exception(
            "Failed to empty Trash"
        )

        return jsonify({
            "error": "Failed to empty Trash"
        }), 500

    return jsonify({
        "message": "Trash emptied successfully",
        "deleted_files": len(trashed_files),
        "deleted_folders": len(trashed_folders)
    }), 200