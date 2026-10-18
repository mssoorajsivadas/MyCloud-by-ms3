import os
import uuid
import filetype
import subprocess
import shutil
from PIL import Image, UnidentifiedImageError
from flask import current_app
from app.models.file import File


### Get Unique File Name ###
def get_unique_file_name(name, user_id, folder_id):

    new_name = name
    number = 1

    while File.query.filter_by(
        name=new_name,
        user_id=user_id,
        folder_id=folder_id
    ).filter(
        File.deleted_at.is_(None)
    ).first():

        name_without_extension, extension = os.path.splitext(name)

        new_name = (
            f"{name_without_extension} "
            f"({number})"
            f"{extension}"
        )

        number += 1

    return new_name



### Get File Type  ###
def detect_file_type(filename, file_path=None):
    extension = os.path.splitext(filename)[1].lower()

    extension_types = {
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

    expected_type = extension_types.get(extension, "other")

    if not file_path:
        return expected_type

    detected = filetype.guess(file_path)

    if detected is None:
        return "other"

    detected_extension = "." + detected.extension.lower()

    detected_types = {
        ".jpg": "image",
        ".jpeg": "image",
        ".png": "image",
        ".gif": "image",
        ".webp": "image",
        ".bmp": "image",
        ".mp4": "video",
        ".mkv": "video",
        ".mov": "video",
        ".avi": "video",
        ".webm": "video",
        ".mp3": "audio",
        ".wav": "audio",
        ".ogg": "audio",
        ".flac": "audio",
        ".pdf": "pdf",
        ".zip": "archive",
        ".gz": "archive",
        ".7z": "archive",
        ".rar": "archive",
    }

    actual_type = detected_types.get(detected_extension, "other")

    if actual_type != expected_type:
        return "other"

    return actual_type



### Thumbnail generator ###
def create_thumbnail(file_path, file_type):
    # Generate thumbnails only for supported file types.
    if file_type not in {"image", "pdf", "video"}:
        return None

    thumbnail_folder = os.path.join(
        current_app.instance_path,
        "thumbnails"
    )

    os.makedirs(thumbnail_folder, mode=0o700, exist_ok=True)
    os.chmod(thumbnail_folder, 0o700)

    thumbnail_name = f"{uuid.uuid4().hex}.jpg"
    thumbnail_path = os.path.join(
        thumbnail_folder,
        thumbnail_name
    )

    try:
        # ---------------- Image Thumbnail ----------------
        if file_type == "image":

            with Image.open(file_path) as image:
                if image.format not in {"JPEG", "PNG", "GIF", "WEBP", "BMP"}:
                    return None

                if image.width * image.height > 25_000_000:
                    return None

                image.verify()

            with Image.open(file_path) as image:
                image.seek(0)
                image.thumbnail((300, 300))

                if image.mode != "RGB":
                    image = image.convert("RGB")

                image.save(thumbnail_path, "JPEG", quality=80)

        # ---------------- PDF Thumbnail ----------------
        elif file_type == "pdf":

            # Only generate PDF thumbnails.
            if not file_path.lower().endswith(".pdf"):
                return None

            import fitz

            with fitz.open(file_path) as pdf:

                # Reject empty PDFs.
                if pdf.page_count == 0:
                    return None

                # Render the first page at a small resolution.
                page = pdf.load_page(0)
                pix = page.get_pixmap(
                    matrix=fitz.Matrix(0.5, 0.5),
                    alpha=False
                )

                pix.save(thumbnail_path)

        # ---------------- Video Thumbnail ----------------
        elif file_type == "video":

            # Only process known video formats.
            allowed_extensions = {
                ".mp4", ".mkv", ".mov", ".avi", ".webm"
            }

            extension = os.path.splitext(file_path)[1].lower()

            if extension not in allowed_extensions:
                return None

            # Check that FFmpeg is installed.
            ffmpeg_path = shutil.which("ffmpeg")

            if not ffmpeg_path:
                current_app.logger.warning(
                    "FFmpeg is not installed; video thumbnail skipped."
                )
                return None

            # Extract one frame and resize it to fit within 300 × 300.
            command = [
                ffmpeg_path,
                "-nostdin",
                "-hide_banner",
                "-loglevel", "error",
                "-y",
                "-ss", "1",
                "-i", file_path,
                "-frames:v", "1",
                "-vf", "scale=300:300:force_original_aspect_ratio=decrease",
                "-f", "image2",
                "-c:v", "mjpeg",
                "-q:v", "5",
                thumbnail_path,
            ]

            try:
                subprocess.run(
                    command,
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                    timeout=20,
                )
            except subprocess.TimeoutExpired:
                current_app.logger.warning(
                    "Video thumbnail generation timed out."
                )
                return None
            except subprocess.CalledProcessError:
                current_app.logger.warning(
                    "FFmpeg could not generate a video thumbnail."
                )
                return None

        # Confirm that a thumbnail was actually created.
        if not os.path.isfile(thumbnail_path):
            return None

        if os.path.getsize(thumbnail_path) == 0:
            return None

        os.chmod(thumbnail_path, 0o600)

        return thumbnail_name

    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError
    ):
        current_app.logger.warning(
            "Thumbnail could not be generated for an uploaded file."
        )
        return None

    except Exception:
        current_app.logger.exception(
            "Unexpected thumbnail generation error."
        )
        return None

    finally:
        # Remove partial output when generation fails.
        if os.path.exists(thumbnail_path):
            try:
                if os.path.getsize(thumbnail_path) == 0:
                    os.remove(thumbnail_path)
            except OSError:
                current_app.logger.exception(
                    "Failed to clean up thumbnail."
                )



### Get Preview ###
def get_preview_mimetype(filename, file_type):
    extension = os.path.splitext(filename)[1].lower()

    preview_types = {
        # Images
        ".jpg": ("image", "image/jpeg"),
        ".jpeg": ("image", "image/jpeg"),
        ".png": ("image", "image/png"),
        ".gif": ("image", "image/gif"),
        ".webp": ("image", "image/webp"),
        ".bmp": ("image", "image/bmp"),

        # PDF
        ".pdf": ("pdf", "application/pdf"),

        # Video
        ".mp4": ("video", "video/mp4"),
        ".webm": ("video", "video/webm"),

        # Audio
        ".mp3": ("audio", "audio/mpeg"),
        ".wav": ("audio", "audio/wav"),
        ".ogg": ("audio", "audio/ogg"),
        ".m4a": ("audio", "audio/mp4"),
        ".flac": ("audio", "audio/flac"),
    }

    preview_info = preview_types.get(extension)

    if not preview_info:
        return None

    expected_category, mimetype = preview_info

    if file_type != expected_category:
        return None

    return mimetype