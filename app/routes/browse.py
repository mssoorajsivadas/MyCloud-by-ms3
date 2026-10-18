from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models.user import User
from app.models.file import File
from app.models.folder import Folder

from app.utils.session import get_current_session
from app.utils.email_verification import is_verification_grace_period_expired


browse_bp = Blueprint(
    "browse",
    __name__,
    url_prefix="/api/browse"
)



### Search Bar ###S
@browse_bp.route("/search", methods=["GET"])
def search():
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

    query = request.args.get("q", "").strip()

    if not query:
        return jsonify({
            "files": [],
            "folders": []
        }), 200

    if len(query) > 255:
        return jsonify({
            "error": "Search query cannot exceed 255 characters"
        }), 400

    search_pattern = f"%{query}%"

    files = File.query.filter(
        File.user_id == user_id,
        File.name.ilike(search_pattern)
    ).order_by(File.name.asc()).limit(50).all()

    folders = Folder.query.filter(
        Folder.user_id == user_id,
        Folder.name.ilike(search_pattern)
    ).order_by(Folder.name.asc()).limit(50).all()

    return jsonify({
        "files": [
            {
                "id": file.id,
                "name": file.name,
                "folder_id": file.folder_id,
                "size": file.size,
                "file_type": file.file_type,
                "thumbnail_name": file.thumbnail_name
            }
            for file in files
        ],
        "folders": [
            {
                "id": folder.id,
                "name": folder.name,
                "parent_id": folder.parent_id
            }
            for folder in folders
        ]
    }), 200



### Get Full Path After Search ###
@browse_bp.route("/folders/<int:folder_id>/path", methods=["GET"])
def get_folder_path(folder_id):
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

    path = []
    visited = set()
    current_folder_id = folder_id

    while current_folder_id is not None:
        # Prevent infinite loops if the folder hierarchy is corrupted.
        if current_folder_id in visited:
            return jsonify({
                "error": "Invalid folder hierarchy"
            }), 400

        visited.add(current_folder_id)

        folder = Folder.query.filter_by(
            id=current_folder_id,
            user_id=user_id
        ).first()

        if not folder:
            return jsonify({
                "error": "Folder not found"
            }), 404

        path.append({
            "id": folder.id,
            "name": folder.name
        })

        current_folder_id = folder.parent_id

    # The traversal starts at the selected folder, so reverse it.
    path.reverse()

    return jsonify({"path": path}), 200




### Get all image ###
@browse_bp.route("/images", methods=["GET"])
def get_images():
    # Check login
    current_session = get_current_session()

    if not current_session:
        return jsonify({"error": "Not logged in"}), 401

    user_id = current_session.user_id

    # Check user
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 401

    # Check email verification
    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }), 403

    # Get this user's active image files from all folders
    images = File.query.filter(
        File.user_id == user_id,
        File.deleted_at.is_(None),
        File.file_type == "image"
    ).order_by(File.name.asc()).all()

    # Return image information
    return jsonify([
        {
            "id": file.id,
            "name": file.name,
            "folder_id": file.folder_id,
            "size": file.size,
            "file_type": file.file_type,
            "thumbnail_name": file.thumbnail_name
        }
        for file in images
    ]), 200


### Get all document ###
@browse_bp.route("/documents", methods=["GET"])
def get_documents():
    # Check login
    current_session = get_current_session()

    if not current_session:
        return jsonify({"error": "Not logged in"}), 401

    user_id = current_session.user_id

    # Check user
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 401

    # Check email verification
    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }), 403

    # Categories considered documents
    document_types = [
        "pdf",
        "document",
        "spreadsheet",
        "presentation"
    ]

    # Get this user's active document files from all folders
    documents = File.query.filter(
        File.user_id == user_id,
        File.deleted_at.is_(None),
        File.file_type.in_(document_types)
    ).order_by(File.name.asc()).all()

    return jsonify([
        {
            "id": file.id,
            "name": file.name,
            "folder_id": file.folder_id,
            "size": file.size,
            "file_type": file.file_type,
            "thumbnail_name": file.thumbnail_name
        }
        for file in documents
    ]), 200



### Get all videos ###
@browse_bp.route("/videos", methods=["GET"])
def get_videos():
    # Check login
    current_session = get_current_session()

    if not current_session:
        return jsonify({"error": "Not logged in"}), 401

    user_id = current_session.user_id

    # Check user
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 401

    # Check email verification
    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }), 403

    # Get this user's active image files from all folders
    images = File.query.filter(
        File.user_id == user_id,
        File.deleted_at.is_(None),
        File.file_type == "video"
    ).order_by(File.name.asc()).all()

    # Return image information
    return jsonify([
        {
            "id": file.id,
            "name": file.name,
            "folder_id": file.folder_id,
            "size": file.size,
            "file_type": file.file_type,
            "thumbnail_name": file.thumbnail_name
        }
        for file in images
    ]), 200