from app.extensions import db


### Files Tables ###

class File(db.Model):

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    name = db.Column(
        db.String(255),
        nullable=False
    )

    stored_name = db.Column(
        db.String(255),
        nullable=False
    )

    size = db.Column(
        db.Integer,
        nullable=False
    )

    file_type = db.Column(
        db.String(50),
        nullable=False,
        default="other"
    )

    thumbnail_name = db.Column(
        db.String(255),
        nullable=True
    )

    user_id = db.Column(
        db.Integer,
        nullable=False
    )

    folder_id = db.Column(
        db.Integer,
        nullable=True
    )

    deleted_at = db.Column(
        db.DateTime, 
        nullable=True, 
        default=None
    )