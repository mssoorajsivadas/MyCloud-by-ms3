import os
import uuid
from flask import (
    Blueprint,
    request,
    jsonify,
    current_app,
    send_file
)
from app.extensions import db
from app.models.file import File
from app.models.folder import Folder
from werkzeug.utils import secure_filename
from app.utils.session import get_current_session
from app.models.user import User
from app.utils.email_verification import is_verification_grace_period_expired



file_bp = Blueprint("file", __name__, url_prefix="/api/files")
'''
#============================#

    Get File Type

#============================#
'''
def detect_file_type(filename):
    extension = os.path.splitext(filename)[1].lower()

    file_types = {
        # Images
        ".jpg": "image",
        ".jpeg": "image",
        ".png": "image",
        ".gif": "image",
        ".webp": "image",
        ".bmp": "image",
        ".svg": "image",

        # Videos
        ".mp4": "video",
        ".mkv": "video",
        ".mov": "video",
        ".avi": "video",
        ".webm": "video",

        # Audio
        ".mp3": "audio",
        ".wav": "audio",
        ".ogg": "audio",
        ".m4a": "audio",
        ".flac": "audio",

        # Documents
        ".pdf": "pdf",
        ".doc": "document",
        ".docx": "document",
        ".odt": "document",
        ".xls": "spreadsheet",
        ".xlsx": "spreadsheet",
        ".csv": "spreadsheet",
        ".ppt": "presentation",
        ".pptx": "presentation",

        # Text and code
        ".txt": "text",
        ".md": "text",
        ".py": "code",
        ".js": "code",
        ".html": "code",
        ".css": "code",
        ".json": "code",
        ".sql": "code",

        # Archives
        ".zip": "archive",
        ".rar": "archive",
        ".7z": "archive",
        ".tar": "archive",
        ".gz": "archive",
    }

    return file_types.get(extension, "other")

'''
#============================#

    File Upload

#============================#
'''
@file_bp.route("/", methods=["POST"])
def upload_file():

    current_session = get_current_session()

    if not current_session:
        return jsonify({
            "massage": "Not logged in"
        }), 401

    user_id = current_session.user_id

    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 401

    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }), 403

    uploaded_file = request.files.get("file")

    if not uploaded_file:
        return jsonify({
            "massage": "No file uploaded"
        }), 400

    original_name = secure_filename(
        uploaded_file.filename
    )

    if not original_name:
        return jsonify({
            "massage": "Invalid filename"
        }), 400

    folder_id = request.form.get(
        "folder_id",
        type=int
    )

    if folder_id is not None:

        folder = Folder.query.filter_by(
            id=folder_id,
            user_id=user_id
        ).first()

        if not folder:
            return jsonify({
                "massage": "Folder not found"
            }), 404

    name = get_unique_file_name(
        original_name,
        user_id,
        folder_id
    )

    extension = os.path.splitext(
        original_name
    )[1]

    stored_name = (
        f"{uuid.uuid4().hex}"
        f"{extension}"
    )

    storage_folder = os.path.join(
        current_app.instance_path,
        "uploads"
    )

    os.makedirs(
        storage_folder,
        exist_ok=True
    )

    file_path = os.path.join(
        storage_folder,
        stored_name
    )

    uploaded_file.save(file_path)

    size = os.path.getsize(file_path)

    file_type = detect_file_type(original_name)

    file = File(
        name=name,
        stored_name=stored_name,
        size=size,
        file_type=file_type,
        user_id=user_id,
        folder_id=folder_id
    )

    db.session.add(file)
    db.session.commit()

    return jsonify({
        "message": "File uploaded successfully",
        "file": {
            "id": file.id,
            "name": file.name,
            "size": file.size,
            "folder_id": file.folder_id
        }
    }), 201

'''
#============================#

    File Download

#============================#
'''
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
        return jsonify({"error": "User not found"}), 401

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

    storage_folder = os.path.join(
        current_app.instance_path,
        "uploads"
    )

    file_path = os.path.join(
        storage_folder,
        file.stored_name
    )

    if not os.path.exists(file_path):
        return jsonify({
            "error": "Physical file not found"
        }), 404

    return send_file(
        file_path,
        as_attachment=True,
        download_name=file.name
    )

'''
#============================#

    File Info

#============================#
'''
@file_bp.route("/", methods=["GET"])
def get_files():

    current_session = get_current_session()
    
    if not current_session:
        return jsonify({
            "error": "Not logged in"
        }), 401
    
    user_id = current_session.user_id

    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 401

    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }), 403

    folder_id = request.args.get(
        "folder_id",
        type=int
    )
    
    files =  File.query.filter_by(
        user_id=user_id,
        folder_id=folder_id
    ).all()

    return jsonify([
            {
                "id": file.id,
                "name": file.name,
                "folder_id": file.folder_id,
                "size": file.size,
                "file_type": file.file_type
            }
            for file in files
        ]), 200

'''
#============================#

    File Info

#============================#
'''
@file_bp.route("/<int:file_id>", methods=["PATCH"])
def rename_file(file_id):

    current_session = get_current_session()
    
    if not current_session:
        return jsonify({
            "error": "Not logged in"
        }), 401
    
    user_id = current_session.user_id

    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 401

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

    data = request.get_json()

    new_name = data.get("name")

    if not new_name:
        return jsonify({
            "error": "File name is required"
        }), 400

    existing_file = File.query.filter_by(
        name=new_name,
        user_id=user_id,
        folder_id=file.folder_id
    ).first()

    if existing_file and existing_file.id != file.id:
        return jsonify({
            "error": "A file with this name already exists"
        }), 409

    file.name = new_name

    db.session.commit()

    return jsonify({
        "message": "File renamed successfully",
        "file": {
            "id": file.id,
            "name": file.name,
            "folder_id": file.folder_id
        }
    }), 200

'''
#============================#

    Delete File

#============================#
'''
@file_bp.route("/<int:file_id>", methods=["DELETE"])
def delete_file(file_id):

    current_session = get_current_session()
    
    if not current_session:
        return jsonify({
            "error": "Not logged in"
        }), 401
    
    user_id = current_session.user_id

    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 401

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

    storage_folder = os.path.join(
        current_app.instance_path,
        "uploads"
    )

    file_path = os.path.join(
        storage_folder,
        file.stored_name
    )

    if os.path.exists(file_path):
        os.remove(file_path)

    db.session.delete(file)
    db.session.commit()

    return jsonify({
        "message": "File deleted successfully"
    }), 200

'''
#============================#

    Move File 

#============================#
'''
@file_bp.route("/<int:file_id>/move", methods=["PATCH"])
def move_file(file_id):

    current_session = get_current_session()
    
    if not current_session:
        return jsonify({
            "error": "Not logged in"
        }), 401
    
    user_id = current_session.user_id

    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 401

    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }), 403

    # Find the file belonging to this user
    file = File.query.filter_by(
        id=file_id,
        user_id=user_id
    ).first()

    if not file:
        return jsonify({
            "error": "File not found"
        }), 404

    data = request.get_json()

    folder_id = data.get("folder_id")

    # Check destination folder
    if folder_id is not None:

        folder = Folder.query.filter_by(
            id=folder_id,
            user_id=user_id
        ).first()

        if not folder:
            return jsonify({
                "error": "Destination folder not found"
            }), 404

    # Don't move if already in this folder
    if file.folder_id == folder_id:

        return jsonify({
            "error": "File is already in this folder"
        }), 400

    # Make sure the filename doesn't conflict
    new_name = get_unique_file_name(
        file.name,
        user_id,
        folder_id
    )

    file.name = new_name
    file.folder_id = folder_id

    db.session.commit()

    return jsonify({
        "message": "File moved successfully",
        "file": {
            "id": file.id,
            "name": file.name,
            "folder_id": file.folder_id
        }
    }), 200

'''
#============================#

    Copy File

#============================#
'''
@file_bp.route("/<int:file_id>/copy", methods=["POST"])
def copy_file(file_id):

    current_session = get_current_session()
    
    if not current_session:
        return jsonify({
            "error": "Not logged in"
        }), 401
    
    user_id = current_session.user_id

    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 401

    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }), 403

    # Find the original file
    file = File.query.filter_by(
        id=file_id,
        user_id=user_id
    ).first()

    if not file:
        return jsonify({
            "error": "File not found"
        }), 404

    data = request.get_json()

    folder_id = data.get("folder_id")

    # Check destination folder
    if folder_id is not None:

        folder = Folder.query.filter_by(
            id=folder_id,
            user_id=user_id
        ).first()

        if not folder:
            return jsonify({
                "error": "Destination folder not found"
            }), 404

    # Create a unique visible filename
    new_name = get_unique_file_name(
        file.name,
        user_id,
        folder_id
    )

    storage_folder = os.path.join(
        current_app.instance_path,
        "uploads"
    )

    original_path = os.path.join(
        storage_folder,
        file.stored_name
    )

    if not os.path.exists(original_path):
        return jsonify({
            "error": "Physical file not found"
        }), 404

    # Create a new physical filename
    new_stored_name = (
        f"{uuid.uuid4().hex}"
        f"{os.path.splitext(file.name)[1]}"
    )

    new_path = os.path.join(
        storage_folder,
        new_stored_name
    )

    # Copy the actual file
    import shutil

    shutil.copy2(
        original_path,
        new_path
    )

    # Get copied file size
    size = os.path.getsize(new_path)

    # Create a new database record
    copied_file = File(
        name=new_name,
        stored_name=new_stored_name,
        size=size,
        user_id=user_id,
        folder_id=folder_id
    )

    db.session.add(copied_file)
    db.session.commit()

    return jsonify({
        "message": "File copied successfully",
        "file": {
            "id": copied_file.id,
            "name": copied_file.name,
            "size": copied_file.size,
            "folder_id": copied_file.folder_id
        }
    }), 201

'''
#============================#

    Get Unique File Name

#============================#
'''
def get_unique_file_name(name, user_id, folder_id):

    new_name = name
    number = 1

    while File.query.filter_by(
        name=new_name,
        user_id=user_id,
        folder_id=folder_id
    ).first():

        name_without_extension, extension = os.path.splitext(name)

        new_name = (
            f"{name_without_extension} "
            f"({number})"
            f"{extension}"
        )

        number += 1

    return new_name