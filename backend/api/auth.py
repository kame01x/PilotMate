import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field

from backend.config import JWT_EXPIRY_MINUTES, JWT_SECRET_KEY
from backend.database import SessionLocal
from backend.models import Instructor, Student

router = APIRouter(prefix="/auth", tags=["auth"])


class SignupStudent(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8)
    school: str | None = None
    country: str | None = None
    authority: str | None = None
    home_airport: str | None = None


class SignupInstructor(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8)
    school: str | None = None


class Login(BaseModel):
    email: EmailStr
    password: str


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False


def _token(sub: str, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRY_MINUTES)
    return jwt.encode({"sub": sub, "role": role, "exp": exp}, JWT_SECRET_KEY, algorithm="HS256")


def _next_business_id(session, model, field, prefix) -> str:
    rows = session.query(model).all()
    return f"{prefix}-{len(rows) + 1:04d}"


@router.post("/student/signup", status_code=201)
def student_signup(body: SignupStudent):
    session = SessionLocal()
    try:
        if session.query(Student).filter_by(email=body.email).first():
            raise HTTPException(400, "Email already registered")
        sid = _next_business_id(session, Student, "student_id", "STU")
        student = Student(
            student_id=sid, name=body.name, email=body.email, school=body.school,
            country=body.country, authority=body.authority, home_airport=body.home_airport,
            hashed_password=_hash(body.password),
        )
        session.add(student)
        session.commit()
        return {"student_id": sid, "email": body.email}
    finally:
        session.close()


@router.post("/instructor/signup", status_code=201)
def instructor_signup(body: SignupInstructor):
    session = SessionLocal()
    try:
        if session.query(Instructor).filter_by(email=body.email).first():
            raise HTTPException(400, "Email already registered")
        iid = _next_business_id(session, Instructor, "instructor_id", "INS")
        instructor = Instructor(
            instructor_id=iid, name=body.name, email=body.email, school=body.school,
            hashed_password=_hash(body.password),
        )
        session.add(instructor)
        session.commit()
        return {"instructor_id": iid, "email": body.email}
    finally:
        session.close()


@router.post("/student/login")
def student_login(body: Login):
    session = SessionLocal()
    try:
        student = session.query(Student).filter_by(email=body.email).first()
        if student is None or not _verify(body.password, student.hashed_password or ""):
            raise HTTPException(401, "Invalid email or password")
        return {"access_token": _token(student.student_id, "student"), "token_type": "bearer", "student_id": student.student_id}
    finally:
        session.close()


@router.post("/instructor/login")
def instructor_login(body: Login):
    session = SessionLocal()
    try:
        instructor = session.query(Instructor).filter_by(email=body.email).first()
        if instructor is None or not _verify(body.password, instructor.hashed_password or ""):
            raise HTTPException(401, "Invalid email or password")
        return {"access_token": _token(instructor.instructor_id, "instructor"), "token_type": "bearer", "instructor_id": instructor.instructor_id}
    finally:
        session.close()
