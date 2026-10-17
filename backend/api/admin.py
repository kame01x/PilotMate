import secrets
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from backend.api.deps import get_payload
from backend.database import SessionLocal
from backend.models import AdminUser, AuditLog, Instructor, Invite, Student

router = APIRouter(prefix="/admin", tags=["admin"])


class InviteBody(BaseModel):
    email: EmailStr
    role: str = Field(pattern="^(student|instructor)$")
    expires_in_days: int = Field(default=7, ge=1, le=90)


class ApproveBody(BaseModel):
    user_id: int
    user_type: str = Field(pattern="^(student|instructor)$")


class StatusBody(BaseModel):
    user_id: int
    user_type: str = Field(pattern="^(student|instructor)$")
    status: str = Field(pattern="^(pending|active|suspended|revoked|expired)$")


class ExtendBody(BaseModel):
    user_id: int
    user_type: str = Field(pattern="^(student|instructor)$")
    days: int = Field(ge=1, le=365)


class RevokeInviteBody(BaseModel):
    invite_id: int


def _require_admin(payload: dict) -> AdminUser:
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    admin_id = payload.get("sub")
    session = SessionLocal()
    try:
        admin = session.query(AdminUser).filter_by(id=int(admin_id)).first()
        if admin is None:
            raise HTTPException(status_code=401, detail="Admin account not found")
        session.expunge(admin)
        return admin
    finally:
        session.close()


def _audit(admin_id: int, action: str, target_id: int | None = None,
           target_type: str | None = None, metadata: dict | None = None):
    session = SessionLocal()
    try:
        log = AuditLog(
            actor_id=admin_id, actor_role="admin", action=action,
            target_id=target_id, target_type=target_type, metadata_json=metadata,
        )
        session.add(log)
        session.commit()
    finally:
        session.close()


@router.post("/invites")
def create_invite(body: InviteBody, admin: AdminUser = Depends(lambda payload=Depends(get_payload): _require_admin(payload))):
    code = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)
    session = SessionLocal()
    try:
        invite = Invite(
            email=body.email, role=body.role, code=code,
            created_by_admin_id=admin.id, expires_at=expires_at,
        )
        session.add(invite)
        session.commit()
        session.refresh(invite)
        invite_id = invite.id
    finally:
        session.close()
    _audit(admin.id, "invite_created", target_id=invite_id, target_type="invite",
           metadata={"email": body.email, "role": body.role})
    return {"invite_code": code, "email": body.email, "role": body.role,
            "expires_at": expires_at.isoformat()}


@router.post("/invites/revoke")
def revoke_invite(body: RevokeInviteBody, admin: AdminUser = Depends(lambda payload=Depends(get_payload): _require_admin(payload))):
    session = SessionLocal()
    try:
        invite = session.query(Invite).filter_by(id=body.invite_id).first()
        if invite is None:
            raise HTTPException(status_code=404, detail="Invite not found")
        if invite.used_at is not None:
            raise HTTPException(status_code=400, detail="Cannot revoke a used invite")
        invite_email = invite.email
        if invite.revoked_at is None:
            invite.revoked_at = datetime.now(timezone.utc)
            session.commit()
    finally:
        session.close()
    _audit(admin.id, "invite_revoked", target_id=body.invite_id, target_type="invite",
           metadata={"email": invite_email})
    return {"revoked": True, "invite_id": body.invite_id}


@router.get("/invites")
def list_invites(admin: AdminUser = Depends(lambda payload=Depends(get_payload): _require_admin(payload))):
    session = SessionLocal()
    try:
        rows = session.query(Invite).order_by(Invite.created_at.desc()).all()
        return [
            {
                "id": i.id, "email": i.email, "role": i.role, "code": i.code,
                "created_at": i.created_at.isoformat(), "expires_at": i.expires_at.isoformat(),
                "used_at": i.used_at.isoformat() if i.used_at else None,
                "revoked_at": i.revoked_at.isoformat() if i.revoked_at else None,
            }
            for i in rows
        ]
    finally:
        session.close()


@router.get("/users")
def list_users(admin: AdminUser = Depends(lambda payload=Depends(get_payload): _require_admin(payload))):
    session = SessionLocal()
    try:
        students = session.query(Student).order_by(Student.created_at.desc()).all()
        instructors = session.query(Instructor).order_by(Instructor.created_at.desc()).all()
        return {
            "students": [
                {"id": s.id, "business_id": s.student_id, "name": s.name, "email": s.email,
                 "account_status": s.account_status, "created_at": s.created_at.isoformat()}
                for s in students
            ],
            "instructors": [
                {"id": i.id, "business_id": i.instructor_id, "name": i.name, "email": i.email,
                 "account_status": i.account_status, "created_at": i.created_at.isoformat()}
                for i in instructors
            ],
        }
    finally:
        session.close()


@router.post("/approve")
def approve_user(body: ApproveBody, admin: AdminUser = Depends(lambda payload=Depends(get_payload): _require_admin(payload))):
    session = SessionLocal()
    try:
        model = Student if body.user_type == "student" else Instructor
        row = session.query(model).filter_by(id=body.user_id).first()
        if row is None:
            raise HTTPException(status_code=404, detail="User not found")
        row.account_status = "active"
        session.commit()
    finally:
        session.close()
    _audit(admin.id, "user_approved", target_id=body.user_id, target_type=body.user_type)
    return {"approved": True, "user_id": body.user_id, "user_type": body.user_type}


@router.post("/status")
def set_status(body: StatusBody, admin: AdminUser = Depends(lambda payload=Depends(get_payload): _require_admin(payload))):
    session = SessionLocal()
    try:
        model = Student if body.user_type == "student" else Instructor
        row = session.query(model).filter_by(id=body.user_id).first()
        if row is None:
            raise HTTPException(status_code=404, detail="User not found")
        row.account_status = body.status
        session.commit()
    finally:
        session.close()
    _audit(admin.id, f"user_{body.status}", target_id=body.user_id, target_type=body.user_type)
    return {"status": body.status, "user_id": body.user_id, "user_type": body.user_type}


@router.post("/extend")
def extend_access(body: ExtendBody, admin: AdminUser = Depends(lambda payload=Depends(get_payload): _require_admin(payload))):
    session = SessionLocal()
    try:
        model = Student if body.user_type == "student" else Instructor
        row = session.query(model).filter_by(id=body.user_id).first()
        if row is None:
            raise HTTPException(status_code=404, detail="User not found")
        if row.account_status == "expired":
            row.account_status = "active"
        session.commit()
    finally:
        session.close()
    _audit(admin.id, "access_extended", target_id=body.user_id, target_type=body.user_type,
           metadata={"days": body.days})
    return {"extended": True, "user_id": body.user_id, "user_type": body.user_type, "days": body.days}


@router.get("/audit-log")
def audit_log(admin: AdminUser = Depends(lambda payload=Depends(get_payload): _require_admin(payload))):
    session = SessionLocal()
    try:
        rows = session.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(200).all()
        return [
            {"id": a.id, "actor_id": a.actor_id, "action": a.action,
             "target_id": a.target_id, "target_type": a.target_type,
             "metadata": a.metadata_json, "created_at": a.created_at.isoformat()}
            for a in rows
        ]
    finally:
        session.close()
