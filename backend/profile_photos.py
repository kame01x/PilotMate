"""Student profile-photo storage.

Photos are intentionally kept out of the database and out of the public
web root. Files are addressed by a hash of the student's business ID, so a
caller can never choose another student's path, and they are only served by an
authenticated endpoint.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

from fastapi import HTTPException

MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_DIR = _PROJECT_ROOT / "storage" / "profile_photos"

_MEDIA_EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}


def _photo_dir(create: bool = False) -> Path:
    configured = os.getenv("PROFILE_PHOTO_DIR")
    directory = Path(configured).expanduser() if configured else _DEFAULT_DIR
    if create:
        directory.mkdir(parents=True, exist_ok=True)
    return directory


def _key(student_id: str) -> str:
    return hashlib.sha256(student_id.encode("utf-8")).hexdigest()


def _paths(student_id: str) -> tuple[Path, Path]:
    base = _photo_dir() / _key(student_id)
    return base.with_suffix(".bin"), base.with_suffix(".type")


def _detect_media_type(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _validate(data: bytes, declared_type: str | None) -> str:
    if not data:
        raise HTTPException(400, "Choose an image to upload.")
    if len(data) > MAX_PROFILE_PHOTO_BYTES:
        raise HTTPException(413, "Profile photos must be 2 MB or smaller.")

    detected = _detect_media_type(data)
    if detected is None:
        raise HTTPException(400, "Profile photos must be PNG, JPEG, or WebP images.")

    declared = (declared_type or "").split(";", 1)[0].strip().lower()
    if declared and declared not in {"application/octet-stream", "image/jpg"} and declared != detected:
        raise HTTPException(400, "The file content does not match its image type.")
    return detected


def save_profile_photo(student_id: str, data: bytes, declared_type: str | None) -> str:
    """Replace the authenticated student's photo and return its media type."""
    media_type = _validate(data, declared_type)
    directory = _photo_dir(create=True)
    base = directory / _key(student_id)
    data_path = base.with_suffix(".bin")
    type_path = base.with_suffix(".type")
    tmp_path = base.with_suffix(".tmp")

    try:
        with tmp_path.open("wb") as handle:
            handle.write(data)
        os.replace(tmp_path, data_path)
        type_path.write_text(media_type, encoding="ascii")
    except OSError as exc:
        for path in (tmp_path, data_path, type_path):
            try:
                if path.exists() and path != data_path:
                    path.unlink()
            except OSError:
                pass
        raise HTTPException(500, "Could not save the profile photo.") from exc

    return media_type


def read_profile_photo(student_id: str) -> tuple[bytes, str] | None:
    data_path, type_path = _paths(student_id)
    if not data_path.is_file():
        return None

    try:
        data = data_path.read_bytes()
    except OSError:
        return None
    if not data or len(data) > MAX_PROFILE_PHOTO_BYTES:
        return None

    media_type = None
    try:
        stored = type_path.read_text(encoding="ascii").strip()
        media_type = stored if stored in _MEDIA_EXTENSIONS else None
    except OSError:
        pass

    detected = _detect_media_type(data)
    if detected is None:
        return None
    return data, detected if media_type is None else media_type


def profile_photo_exists(student_id: str) -> bool:
    data_path, _ = _paths(student_id)
    return data_path.is_file()
