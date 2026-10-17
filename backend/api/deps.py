import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from backend.config import JWT_EXPIRY_MINUTES, JWT_SECRET_KEY
from backend.database import SessionLocal
from backend.models import Instructor, Student

ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)


def _unauthenticated():
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid credentials")


def get_payload(token: str | None = Depends(oauth2_scheme)) -> dict:
    if not token:
        raise _unauthenticated()
    if not JWT_SECRET_KEY:
        raise HTTPException(status_code=500, detail="JWT_SECRET_KEY not configured")
    try:
        return jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise _unauthenticated()


def _get_model(payload: dict, role: str):
    if payload.get("role") != role:
        raise HTTPException(status_code=403, detail=f"{role} role required")
    business_id = payload.get("sub")
    session = SessionLocal()
    try:
        model = Student if role == "student" else Instructor
        field = "student_id" if role == "student" else "instructor_id"
        row = session.query(model).filter(getattr(model, field) == business_id).first()
        if row is None:
            raise HTTPException(status_code=401, detail="Account not found")
        if row.account_status != "active":
            raise HTTPException(status_code=401, detail="Account is not active")
        session.expunge(row)
        return row
    finally:
        session.close()


def get_current_student(payload: dict = Depends(get_payload)) -> Student:
    return _get_model(payload, "student")


def get_current_instructor(payload: dict = Depends(get_payload)) -> Instructor:
    return _get_model(payload, "instructor")


def get_current_user(payload: dict = Depends(get_payload)):
    role = payload.get("role")
    if role not in ("student", "instructor"):
        raise HTTPException(status_code=403, detail="Unknown role")
    _get_model(payload, role)
    return {"role": role, "id": payload.get("sub")}
