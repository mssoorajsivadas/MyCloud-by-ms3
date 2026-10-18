from app.extensions import db


### Folder Tables ###

class Folder(db.Model):

    id = db.Column(
        db.Integer, 
        primary_key=True
    )

    name = db.Column(
        db.String(255), 
        nullable=False
    )

    user_id = db.Column(
        db.Integer, 
        nullable=False
    )

    parent_id = db.Column(
        db.Integer, 
        nullable=True
    )

    deleted_at = db.Column(
        db.DateTime, 
        nullable=True, 
        default=None
    )