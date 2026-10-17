"""Provision the initial administrator account. Run once, interactively.
Usage: uv run python scripts/create_admin.py"""
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.api.auth import _hash
from backend.database import SessionLocal
from backend.models import AdminUser


def main():
    email = input("Admin email: ").strip()
    if not email or "@" not in email:
        print("Invalid email.")
        return
    name = input("Admin name: ").strip()
    if not name:
        print("Name is required.")
        return
    password = getpass.getpass("Admin password (min 8 chars): ")
    if len(password) < 8:
        print("Password must be at least 8 characters.")
        return
    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("Passwords do not match.")
        return

    session = SessionLocal()
    try:
        if session.query(AdminUser).filter_by(email=email).first():
            print("An admin with this email already exists.")
            return
        admin = AdminUser(email=email, name=name, hashed_password=_hash(password))
        session.add(admin)
        session.commit()
        print(f"\nAdmin account created: {email} (id={admin.id})")
        print("You can now log in via POST /auth/admin/login")
    finally:
        session.close()


if __name__ == "__main__":
    main()
