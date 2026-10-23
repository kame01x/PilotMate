import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from backend.config import JWT_EXPIRY_MINUTES, JWT_SECRET_KEY
from backend.api.ratelimit import rate_limit_by_email
from backend.database import SessionLocal
from backend.models import AdminUser, AuditLog, Instructor, Invite, Student

router = APIRouter(prefix="/auth", tags=["auth"])


class SignupStudent(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8)
    invite_code: str | None = None
    school: str | None = None
    country: str | None = None
    authority: str | None = None
    home_airport: str | None = None


class SignupInstructor(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8)
    invite_code: str | None = None
    school: str | None = None


class Login(BaseModel):
    email: EmailStr
    password: str


_student_signup_limit = rate_limit_by_email(SignupStudent)
_instructor_signup_limit = rate_limit_by_email(SignupInstructor)
_login_limit = rate_limit_by_email(Login)


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
    rows = session.query(getattr(model, field)).all()
    max_n = 0
    for (value,) in rows:
        if value and value.startswith(f"{prefix}-"):
            suffix = value.split("-", 1)[1]
            if suffix.isdigit():
                max_n = max(max_n, int(suffix))
    return f"{prefix}-{max_n + 1:04d}"


def _validate_invite(session, code: str, email: str, role: str) -> Invite:
    invite = session.query(Invite).filter_by(code=code).first()
    if invite is None:
        raise HTTPException(400, "Invalid invite code")
    if invite.revoked_at is not None:
        raise HTTPException(400, "This invite has been revoked")
    if invite.used_at is not None:
        raise HTTPException(400, "This invite has already been used")
    expires_at = invite.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, "This invite has expired")
    if invite.email.lower() != email.lower():
        raise HTTPException(400, "This invite was issued for a different email address")
    if invite.role != role:
        raise HTTPException(400, f"This invite is for a {invite.role} account, not {role}")
    return invite


@router.post("/student/signup", status_code=201)
async def student_signup(body: SignupStudent, _: None = Depends(_student_signup_limit)):
    session = SessionLocal()
    try:
        if session.query(Student).filter_by(email=body.email).first():
            raise HTTPException(400, "Email already registered")
        invite = None
        if body.invite_code:
            invite = _validate_invite(session, body.invite_code, body.email, "student")
        sid = _next_business_id(session, Student, "student_id", "STU")
        student = Student(
            student_id=sid, name=body.name, email=body.email, school=body.school,
            country=body.country, authority=body.authority, home_airport=body.home_airport,
            hashed_password=_hash(body.password), account_status="active",
        )
        session.add(student)
        session.commit()
        session.refresh(student)
        metadata = {"email": body.email}
        if invite is not None:
            invite.used_at = datetime.now(timezone.utc)
            invite.used_by_user_id = student.id
            metadata["invite_code"] = invite.code[:8] + "..."
            session.commit()
        log = AuditLog(
            actor_id=student.id, actor_role="student", action="signup",
            target_id=student.id, target_type="student",
            metadata_json=metadata,
        )
        session.add(log)
        session.commit()
        return {"student_id": sid, "email": body.email, "status": "active"}
    finally:
        session.close()


@router.post("/instructor/signup", status_code=201)
async def instructor_signup(body: SignupInstructor, _: None = Depends(_instructor_signup_limit)):
    session = SessionLocal()
    try:
        if session.query(Instructor).filter_by(email=body.email).first():
            raise HTTPException(400, "Email already registered")
        invite = None
        if body.invite_code:
            invite = _validate_invite(session, body.invite_code, body.email, "instructor")
        iid = _next_business_id(session, Instructor, "instructor_id", "INS")
        instructor = Instructor(
            instructor_id=iid, name=body.name, email=body.email, school=body.school,
            hashed_password=_hash(body.password), account_status="active",
        )
        session.add(instructor)
        session.commit()
        session.refresh(instructor)
        metadata = {"email": body.email}
        if invite is not None:
            invite.used_at = datetime.now(timezone.utc)
            invite.used_by_user_id = instructor.id
            metadata["invite_code"] = invite.code[:8] + "..."
            session.commit()
        log = AuditLog(
            actor_id=instructor.id, actor_role="instructor", action="signup",
            target_id=instructor.id, target_type="instructor",
            metadata_json=metadata,
        )
        session.add(log)
        session.commit()
        return {"instructor_id": iid, "email": body.email, "status": "active"}
    finally:
        session.close()


@router.post("/student/login")
async def student_login(body: Login, _: None = Depends(_login_limit)):
    session = SessionLocal()
    try:
        student = session.query(Student).filter_by(email=body.email).first()
        if student is None or not _verify(body.password, student.hashed_password or ""):
            raise HTTPException(401, "Invalid email or password")
        if student.account_status != "active":
            raise HTTPException(403, "Account is not active")
        return {"access_token": _token(student.student_id, "student"), "token_type": "bearer", "student_id": student.student_id}
    finally:
        session.close()


@router.post("/instructor/login")
async def instructor_login(body: Login, _: None = Depends(_login_limit)):
    session = SessionLocal()
    try:
        instructor = session.query(Instructor).filter_by(email=body.email).first()
        if instructor is None or not _verify(body.password, instructor.hashed_password or ""):
            raise HTTPException(401, "Invalid email or password")
        if instructor.account_status != "active":
            raise HTTPException(403, "Account is not active")
        return {"access_token": _token(instructor.instructor_id, "instructor"), "token_type": "bearer", "instructor_id": instructor.instructor_id}
    finally:
        session.close()


@router.post("/admin/login")
async def admin_login(body: Login, _: None = Depends(_login_limit)):
    session = SessionLocal()
    try:
        admin = session.query(AdminUser).filter_by(email=body.email).first()
        if admin is None or not _verify(body.password, admin.hashed_password or ""):
            raise HTTPException(401, "Invalid email or password")
        return {"access_token": _token(str(admin.id), "admin"), "token_type": "bearer", "admin_id": admin.id}
    finally:
        session.close()
