import os
from flask import Flask
from app.extensions import db, mail
from dotenv import load_dotenv

def create_app():

    app = Flask(__name__)

    '''
    #============================#
       Flask config
    #============================#
    '''
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY")

    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///cloud_drive.db"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    app.config["MAIL_SERVER"] = "smtp.gmail.com"
    app.config["MAIL_USE_TLS"] = True
    app.config["MAIL_PORT"] = 587
    app.config["MAIL_USERNAME"] = os.environ.get("MAIL_USERNAME")
    app.config["MAIL_PASSWORD"] = os.environ.get("MAIL_PASSWORD")


    db.init_app(app)
    mail.init_app(app)

    load_dotenv()

    '''
    #============================#
       Flask Blue Prints
    #============================#
    '''
    from app.main import main_bp
    from app.routes.auth import auth_bp
    from app.routes.folder import folder_bp
    from app.routes.file import file_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(folder_bp)
    app.register_blueprint(file_bp)

    '''
    #============================#
       Databases
    #============================#
    '''
    from app.models.user import User
    from app.models.session import Session
    from app.models.folder import Folder
    from app.models.file import File
    from app.models.email_verification_token import EmailVerificationToken


    with app.app_context():
        db.create_all()

    return app