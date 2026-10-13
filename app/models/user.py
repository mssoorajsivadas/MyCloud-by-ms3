from app.extensions import db


'''
#============================#
        Users Tables
#============================#
'''
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    email = db.Column(
        db.String(255),
        unique=True,
        nullable=False
    )

    username = db.Column(
        db.String(80),
        unique=True,
        nullable=False
    )

    first_name = db.Column(
        db.String(100),
        nullable=False
    )

    second_name = db.Column(
        db.String(100),
        nullable=False
    )

    password_hash = db.Column(
        db.String(255),
        nullable=False
    )

    status = db.Column(
    db.String(20),
    nullable=False,
    default="active"
    )

    deleted_at = db.Column(
    db.DateTime,
    nullable=True
    )

    created_at = db.Column(
    db.DateTime,
    nullable=False,
    default=db.func.now()
    )

    email_verified = db.Column(
    db.Boolean,
    nullable=False,
    default=False
    )