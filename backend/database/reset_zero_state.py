#!/usr/bin/env python3
"""
ClinixVault Clean Zero-Row Database State Utility.
Purges all synthetic/test records across SQLite and PostgreSQL,
leaving all schema tables in a pristine zero-row initial state.
"""

import os
import sys
import sqlite3
from sqlalchemy import text

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "../.."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.database.connection import engine, init_db, Base
import backend.database.models  # Ensures all ORM models are registered in Base.metadata

DB_PATH = os.path.join(SCRIPT_DIR, "clinixvault_edge.db")


def reset_to_zero_rows() -> bool:
    print("=" * 60)
    print("🧹 ClinixVault Zero-Row Database Purge & Verification")
    print("=" * 60)

    # 1. Ensure schemas exist
    init_db()

    # 2. Purge via SQLAlchemy engine (works for SQLite and PostgreSQL)
    with engine.begin() as conn:
        dialect_name = engine.dialect.name
        print(f"Connecting to active dialect: {dialect_name}")

        if dialect_name == "sqlite":
            conn.execute(text("PRAGMA foreign_keys = OFF;"))
            for table_name in Base.metadata.tables.keys():
                conn.execute(text(f'DELETE FROM "{table_name}";'))
            conn.execute(text("PRAGMA foreign_keys = ON;"))
        elif dialect_name == "postgresql":
            table_names = '", "'.join(Base.metadata.tables.keys())
            conn.execute(text(f'TRUNCATE TABLE "{table_names}" CASCADE;'))
        else:
            for table_name in reversed(Base.metadata.sorted_tables):
                conn.execute(text(f'DELETE FROM "{table_name.name}";'))

    # 3. If SQLite, run VACUUM
    if engine.dialect.name == "sqlite":
        try:
            with engine.connect() as conn:
                conn.execution_options(isolation_level="AUTOCOMMIT").execute(text("VACUUM;"))
        except Exception:
            pass

    # 4. Verify 0 rows across all registered tables
    all_zero = True
    print("\nVerifying zero-row counts across schema tables:")
    with engine.connect() as conn:
        for table_name in sorted(Base.metadata.tables.keys()):
            cnt = conn.execute(text(f'SELECT COUNT(*) FROM "{table_name}";')).scalar()
            status = "✅ 0 rows" if cnt == 0 else f"❌ {cnt} rows"
            print(f"  • {table_name:<26} : {status}")
            if cnt != 0:
                all_zero = False

    print("=" * 60)
    if all_zero:
        print("🎉 Database successfully verified in pristine zero-row state!")
        return True
    else:
        print("⚠️ Warning: One or more tables contain non-zero row counts.")
        return False


if __name__ == "__main__":
    success = reset_to_zero_rows()
    sys.exit(0 if success else 1)
