from flask import Blueprint, request, jsonify
from app.utils.session import get_current_session
from app.extensions import db
from app.models.folder import Folder
from app.models.user import User
from app.utils.email_verification import is_verification_grace_period_expired


folder_bp = Blueprint("folder", __name__, url_prefix="/api/folders")

'''
#============================#

    Create Folder

#============================#
'''
@folder_bp.route("/", methods=["POST"])
def create_folder():

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

    data = request.get_json()

    name = data.get("name")
    parent_id = data.get("parent_id")   

    if not name:
        return jsonify({
            "massage": "Folder name is required"
        }), 400 

    parent_folder = None

    if parent_id is not None:
        parent_folder = Folder.query.filter_by(
            id=parent_id,
            user_id=user_id
        ).first()

        if not parent_folder:
            return jsonify({
                "massage": "Parent folder not found"
            }), 404

    name = get_unique_folder_name(
        name,
        user_id,
        parent_id
    )

    folder = Folder(
        name=name,
        user_id=user_id,
        parent_id=parent_id
    )

    db.session.add(folder)
    db.session.commit()

    return jsonify({
        "message": "Folder created successfully",
        "folder": {
            "id": folder.id,
            "name": folder.name,
            "parent_id": folder.parent_id
        }
    }), 201

'''
#============================#

     Folder info 

#============================#
'''
@folder_bp.route("/", methods=["GET"])
def get_folders():

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

    parent_id = request.args.get("parent_id", type=int)

    folders = Folder.query.filter_by(
        user_id=user_id,
        parent_id=parent_id
    ).all()

    return jsonify([
        {
            "id": folder.id,
            "name": folder.name,
            "parent_id": folder.parent_id
        }
        for folder in folders
    ]), 200

'''
#============================#

      Rename Folder 

#============================#
'''
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
        return jsonify({"error": "User not found"}), 401
    
    if is_verification_grace_period_expired(user):
        return jsonify({
            "error": "email_verification_required",
            "message": "Please verify your email to access your Drive."
        }), 403

    folder = Folder.query.filter_by(
        id=folder_id,
        user_id=user_id
    ).first()

    if not folder:
        return jsonify({
            "error": "Folder not found"
        }), 404

    data = request.get_json()
    name = data.get("name")

    if not name:
        return jsonify({
            "error": "Folder name is required"
        }), 400

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

'''
#============================#

    Folder Location Changer 

#============================#
'''
@folder_bp.route("/<int:folder_id>/move", methods=["PATCH"])
def move_folder(folder_id):

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

    folder = Folder.query.filter_by(
        id=folder_id,
        user_id=user_id
    ).first()

    if not folder:
        return jsonify({
            "massage": "Folder not found"
        }), 404

    data = request.get_json()
    parent_id = data.get("parent_id")

    if parent_id == folder.id:
        return jsonify({
            "massage": "You're already in this folder"
        }), 400

    error = validate_folder_destination(
        folder,
        parent_id,
        user_id
    )

    if error:
        return jsonify({
            "error": error
        }), 400

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

'''
#============================#

      Duplicate Folder

#============================#
'''
@folder_bp.route("/<int:folder_id>/copy", methods=["POST"])
def copy_folder(folder_id):

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

    folder = Folder.query.filter_by(
        id=folder_id,
        user_id=user_id
    ).first()

    if not folder:
        return jsonify({
            "massage": "Folder not found"
        }), 404

    data = request.get_json()
    parent_id = data.get("parent_id")

    error = validate_folder_destination(
        folder,
        parent_id,
        user_id
    )

    if error:
        return jsonify({
            "error": error
        }), 400

    copied_folder = copy_folder_tree(
        folder,
        parent_id,
        user_id
    )

    db.session.commit()

    return jsonify({
        "message": "Folder copied successfully",
        "folder": {
            "id": copied_folder.id,
            "name": copied_folder.name,
            "parent_id": copied_folder.parent_id
        }
    }), 201

'''
#============================#

      Delete Folder

#============================#
'''
@folder_bp.route("/<int:folder_id>", methods=["DELETE"])
def delete_folder(folder_id):

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

    folder = Folder.query.filter_by(
        id=folder_id,
        user_id=user_id
    ).first()

    if not folder:
        return jsonify({
            "massage": "Folder not found"
        }), 404

    delete_folder_tree(folder)

    db.session.commit()

    return jsonify({
        "message": "Folder deleted successfully"
    }), 200

'''
#============================#

      Delete Folder Tree

#============================#
'''
def delete_folder_tree(folder):

    children = Folder.query.filter_by(
        parent_id=folder.id,
        user_id=folder.user_id
    ).all()

    for child in children:
        delete_folder_tree(child)

    db.session.delete(folder)

'''
#============================#

      Unique Name 

#============================#
'''
def get_unique_folder_name(name, user_id, parent_id):

    new_name = name
    number = 1

    while Folder.query.filter_by(
        name=new_name,
        user_id=user_id,
        parent_id=parent_id
    ).first():

        new_name = f"{name} ({number})"
        number += 1

    return new_name

'''
#============================#

       Dir Validater

#============================#
'''
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

'''
#============================#

    Folder Tree Duplicater

#============================#
'''
def copy_folder_tree(folder, new_parent_id, user_id):

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

    children = Folder.query.filter_by(
        parent_id=folder.id,
        user_id=user_id
    ).all()

    for child in children:
        copy_folder_tree(
            child,
            copied_folder.id,
            user_id
        )

    return copied_folder