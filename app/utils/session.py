import secrets
import hashlib
import requests
from datetime import datetime, timezone, timedelta
import ipaddress
from flask import request
from app.utils.email_verification import is_verification_grace_period_expired
from app.extensions import db
from app.models.user import User
from app.models.session import Session



### Session Exprie D&T ###
SESSION_IDLE_DAYS = 90
SESSION_MAX_DAYS = 365

SECURITY_CHECK_INTERVAL = 5 * 60
SUSPICIOUS_CHANGE_WINDOW = 10 * 60


### Session Helper ###

##Browser Finder
def detect_browser(user_agent):

    if "Firefox/" in user_agent:
        return "Firefox"

    if "Edg/" in user_agent:
        return "Edge"

    if "Chrome/" in user_agent:
        return "Chrome"

    if "Safari/" in user_agent and "Chrome/" not in user_agent:
        return "Safari"

    return "Unknown"


##OS Finder
def detect_os(user_agent):

    if "Windows NT" in user_agent:
        return "Windows"

    if "Android" in user_agent:
        return "Android"

    if "iPhone" in user_agent or "iPad" in user_agent:
        return "iOS"

    if "Mac OS X" in user_agent:
        return "macOS"

    if "Linux" in user_agent:
        return "Linux"

    return "Unknown"


##Device Finder
def detect_device(user_agent):

    if "Mobile" in user_agent or "Android" in user_agent:
        return "Mobile"

    if "Tablet" in user_agent or "iPad" in user_agent:
        return "Tablet"

    return "Desktop"



##Session info Finder
def get_client_info():
    user_agent = request.headers.get("User-Agent", "")

    return {
        "ip_address": request.remote_addr,
        "user_agent": user_agent,
        "browser": detect_browser(user_agent),
        "operating_system": detect_os(user_agent),
        "device": detect_device(user_agent)
    }


##Session ip location API 
def get_ip_location(ip_address):

    if not ip_address:
        return None

    try:
        ip = ipaddress.ip_address(ip_address)

        if ip.is_private or ip.is_loopback:
            return None

        response = requests.get(
            f"https://ipinfo.io/{ip_address}/json",
            timeout=3
        )

        if response.status_code != 200:
            return None

        data = response.json()

        return {
            "country": data.get("country"),
            "city": data.get("city")
        }

    except (ValueError, requests.RequestException):
        return None
    

### Create Session ###
def create_session(user):

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    session_token = secrets.token_urlsafe(32)

    session_token_hash = hashlib.sha256(
        session_token.encode()
    ).hexdigest()

    client_info = get_client_info()

    location = get_ip_location(
        client_info["ip_address"]
    )

    session = Session(
        user_id=user.id,

        session_token_hash=session_token_hash,

        created_at=now,

        last_seen_at=now,

        idle_expires_at=now + timedelta(
            days=SESSION_IDLE_DAYS
        ),

        absolute_expires_at=now + timedelta(
            days=SESSION_MAX_DAYS
        ),

        ip_address=client_info["ip_address"],

        user_agent=client_info["user_agent"],

        browser=client_info["browser"],

        operating_system=client_info["operating_system"],

        device=client_info["device"],

        country=location["country"] if location else None,

        city=location["city"] if location else None,

        last_security_check_at=now
    )

    db.session.add(session)
    db.session.commit()

    return session_token


### Get Session ###
def get_current_session():
    # 1. Read the session token from the browser cookie.
    session_token = request.cookies.get("session_token")

    if not session_token:
        return None

    # 2. Hash the token before looking it up in the database.
    session_token_hash = hashlib.sha256(
        session_token.encode()
    ).hexdigest()

    current_session = Session.query.filter_by(
        session_token_hash=session_token_hash
    ).first()

    # 3. Reject unknown or revoked sessions.
    if not current_session or current_session.revoked:
        return None

    # 4. Check both expiration limits.
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    if (
        now >= current_session.absolute_expires_at
        or now >= current_session.idle_expires_at
    ):
        current_session.revoked = True
        current_session.revoked_at = now

        db.session.commit()
        return None

    # 5. Confirm that the associated account still exists.
    user = db.session.get(User, current_session.user_id)

    if not user:
        current_session.revoked = True
        current_session.revoked_at = now

        db.session.commit()
        return None

    # 6. Reject disabled or soft-deleted accounts.
    if user.status != "active" or user.deleted_at is not None:
        current_session.revoked = True
        current_session.revoked_at = now

        db.session.commit()
        return None

    return current_session


### Session Security Check ###
def check_session_security(current_session):

    client_info = get_client_info()

    current_location = get_ip_location(
        client_info["ip_address"]
    )

    ip_changed = (
        current_session.ip_address != client_info["ip_address"]
    )

    browser_changed = (
        current_session.browser != client_info["browser"]
    )

    os_changed = (
        current_session.operating_system
        != client_info["operating_system"]
    )

    device_changed = (
        current_session.device != client_info["device"]
    )

    country_changed = False
    city_changed = False

    if current_location:

        country_changed = (
            current_session.country
            != current_location["country"]
        )

        city_changed = (
            current_session.city
            != current_location["city"]
        )

    risk_score = 0

    if ip_changed:
        risk_score += 1

    if browser_changed:
        risk_score += 2

    if os_changed:
        risk_score += 2

    if device_changed:
        risk_score += 1

    suspicious_location_change = False

    now = datetime.now(timezone.utc).replace(
        tzinfo=None
    )

    seconds_since_last_seen = (
        now - current_session.last_seen_at
    ).total_seconds()

    if (
        ip_changed
        and country_changed
        and seconds_since_last_seen
        <= SUSPICIOUS_CHANGE_WINDOW
    ):
        suspicious_location_change = True

    reauth_required = (
        risk_score >= 4
        or suspicious_location_change
    )

    return {
        "ip_changed": ip_changed,
        "country_changed": country_changed,
        "city_changed": city_changed,

        "browser_changed": browser_changed,
        "os_changed": os_changed,
        "device_changed": device_changed,

        "risk_score": risk_score,

        "suspicious_location_change":
            suspicious_location_change,

        "reauth_required": reauth_required
    }