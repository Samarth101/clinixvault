"""
Database Connection Management & Session Pooling for ClinixVault.
Supports PostgreSQL with pgvector extension, with automated SQLite fallback
for offline testing and development.
"""

import os
import sys
from typing import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base, Session

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from inference.shared.config import settings
from inference.shared.logger import get_logger

logger = get_logger("clinixvault.database")

Base = declarative_base()


def get_engine():
    db_url = os.getenv("DATABASE_URL") or settings.DATABASE_URL
    if db_url and db_url.startswith("sqlite"):
        engine = create_engine(db_url, connect_args={"check_same_thread": False})
        logger.info(f"Connected to SQLite database at {db_url}")
        return engine

    # Check if PostgreSQL is available or if fallback SQLite should be used
    if "postgresql" in db_url:
        try:
            engine = create_engine(
                db_url,
                pool_size=settings.POOL_SIZE,
                max_overflow=settings.MAX_OVERFLOW,
                echo=settings.SQL_DEBUG,
                connect_args={"connect_timeout": 3},
            )
            # Verify connectivity
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
                # Try creating pgvector extension if postgres
                try:
                    conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                    conn.commit()
                except Exception as ext_err:
                    logger.info(f"pgvector extension check/creation notice: {ext_err}")
            logger.info("Connected to PostgreSQL database.")
            return engine
        except Exception as e:
            logger.warning(
                f"PostgreSQL unreachable at {db_url} ({e}). "
                "Engaging edge SQLite fallback database."
            )

    # SQLite fallback
    fallback_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "clinixvault_edge.db"))
    fallback_url = f"sqlite:///{fallback_path}"
    engine = create_engine(fallback_url, connect_args={"check_same_thread": False})
    logger.info(f"Connected to edge SQLite database at {fallback_url}")
    return engine


engine = get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Initializes tables in database."""
    Base.metadata.create_all(bind=engine)
    logger.info("Database schemas initialized.")


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a transactional database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
