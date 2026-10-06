import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import inspect

from backend.database import engine

inspector = inspect(engine)
for table_name in inspector.get_table_names():
    print(f"\n=== {table_name} ===")
    for col in inspector.get_columns(table_name):
        name = col["name"]
        col_type = str(col["type"])
        nullable = col["nullable"]
        print(f"  {name:30s} {col_type:20s} nullable={nullable}")
