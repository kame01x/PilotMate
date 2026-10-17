import sqlite3
from pathlib import Path

db_path = Path(__file__).resolve().parent.parent / "pilotmate.db"
if not db_path.exists():
    print(f"Database not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("PRAGMA table_info(students)")
columns = [row[1] for row in cursor.fetchall()]
if "account_status" not in columns:
    cursor.execute("ALTER TABLE students ADD COLUMN account_status VARCHAR(20) NOT NULL DEFAULT 'active'")
    print("Added account_status to students")

cursor.execute("PRAGMA table_info(instructors)")
columns = [row[1] for row in cursor.fetchall()]
if "account_status" not in columns:
    cursor.execute("ALTER TABLE instructors ADD COLUMN account_status VARCHAR(20) NOT NULL DEFAULT 'active'")
    print("Added account_status to instructors")

cursor.execute("""CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY,
    email VARCHAR(200) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    hashed_password VARCHAR(200) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)""")
print("Ensured admin_users table")

cursor.execute("""CREATE TABLE IF NOT EXISTS invites (
    id INTEGER PRIMARY KEY,
    email VARCHAR(200) NOT NULL,
    role VARCHAR(20) NOT NULL,
    code VARCHAR(64) NOT NULL UNIQUE,
    created_by_admin_id INTEGER NOT NULL REFERENCES admin_users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    used_by_user_id INTEGER,
    revoked_at DATETIME
)""")
print("Ensured invites table")

cursor.execute("""CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY,
    actor_id INTEGER NOT NULL,
    actor_role VARCHAR(20) NOT NULL,
    action VARCHAR(100) NOT NULL,
    target_id INTEGER,
    target_type VARCHAR(50),
    metadata_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)""")
print("Ensured audit_log table")

conn.commit()
conn.close()
print("Migration complete.")
