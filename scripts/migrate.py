"""Unified database migration. Works with SQLite and PostgreSQL.
Usage: uv run python scripts/migrate.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.database import Base, engine
from backend.models import (
    AdminUser, Aircraft, AuditLog, Debrief, Document, Flight,
    Instructor, InstructorMessage, Invite, PreflightPackage,
    Student, TechnicalLog,
)


def run_migration():
    print("Running migration...")
    Base.metadata.create_all(bind=engine)
    print("All tables ensured.")

    if engine.dialect.name == "sqlite":
        import sqlite3
        conn = engine.raw_connection()
        cursor = conn.cursor()
        try:
            for table in ("students", "instructors"):
                cursor.execute(f"PRAGMA table_info({table})")
                columns = [row[1] for row in cursor.fetchall()]
                if "account_status" not in columns:
                    cursor.execute(
                        f"ALTER TABLE {table} ADD COLUMN account_status VARCHAR(20) NOT NULL DEFAULT 'active'"
                    )
                    print(f"Added account_status to {table}")
            cursor.execute("PRAGMA table_info(students)")
            student_columns = [row[1] for row in cursor.fetchall()]
            if "is_beta_tester" not in student_columns:
                cursor.execute(
                    "ALTER TABLE students ADD COLUMN is_beta_tester BOOLEAN NOT NULL DEFAULT 0"
                )
                print("Added is_beta_tester to students")
            if "stripe_customer_id" not in student_columns:
                cursor.execute(
                    "ALTER TABLE students ADD COLUMN stripe_customer_id VARCHAR(100)"
                )
                print("Added stripe_customer_id to students")
            conn.commit()
        finally:
            conn.close()
    else:
        from sqlalchemy import text
        with engine.connect() as conn:
            for table in ("students", "instructors"):
                result = conn.execute(text(
                    f"SELECT column_name FROM information_schema.columns "
                    f"WHERE table_name = '{table}' AND column_name = 'account_status'"
                ))
                if result.fetchone() is None:
                    conn.execute(text(
                        f"ALTER TABLE {table} ADD COLUMN account_status VARCHAR(20) NOT NULL DEFAULT 'active'"
                    ))
                    print(f"Added account_status to {table}")
            for column, ddl in (
                ("is_beta_tester", "ALTER TABLE students ADD COLUMN is_beta_tester BOOLEAN NOT NULL DEFAULT FALSE"),
                ("stripe_customer_id", "ALTER TABLE students ADD COLUMN stripe_customer_id VARCHAR(100)"),
            ):
                result = conn.execute(text(
                    "SELECT column_name FROM information_schema.columns "
                    f"WHERE table_name = 'students' AND column_name = '{column}'"
                ))
                if result.fetchone() is None:
                    conn.execute(text(ddl))
                    print(f"Added {column} to students")
            conn.commit()

    print("Migration complete.")


if __name__ == "__main__":
    run_migration()
