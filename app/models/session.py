from app.extensions import db

'''
#============================#
        Session Tables
#============================#
'''
class Session(db.Model):

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    user = db.relationship(
    "User",
    backref="sessions"
    )
    
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("user.id"),
        nullable=False
    )

    session_token_hash = db.Column(
        db.String(255),
        unique=True,
        nullable=False
    )

    created_at = db.Column(
        db.DateTime,
        nullable=False,
        default=db.func.now()
    )

    last_seen_at = db.Column(
        db.DateTime,
        nullable=False,
        default=db.func.now()
    )

    idle_expires_at = db.Column(
        db.DateTime,
        nullable=False
    )

    absolute_expires_at = db.Column(
        db.DateTime,
        nullable=False
    )

    revoked = db.Column(
        db.Boolean,
        nullable=False,
        default=False
    )

    revoked_at = db.Column(
        db.DateTime,
        nullable=True
    )

    ip_address = db.Column(
        db.String(45),
        nullable=True
    )

    user_agent = db.Column(
        db.Text,
        nullable=True
    )

    browser = db.Column(
        db.String(100),
        nullable=True
    )

    operating_system = db.Column(
        db.String(100),
        nullable=True
    )

    device = db.Column(
        db.String(100),
        nullable=True
    )

    country = db.Column(
    db.String(100),
    nullable=True  
    )

    city = db.Column(
        db.String(100),
        nullable=True
    )

    last_security_check_at = db.Column(
        db.DateTime,
        nullable=True
    )