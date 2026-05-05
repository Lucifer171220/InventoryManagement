from sqlalchemy import create_engine, exc
from sqlalchemy.orm import DeclarativeBase, sessionmaker
import logging

from app.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()


class Base(DeclarativeBase):
    pass


# Create engine with proper connection pooling settings for SQL Server
engine = create_engine(
    settings.database_url,
    future=True,
    pool_pre_ping=True,  # Verify connections before using them
    pool_recycle=3600,   # Recycle connections after 1 hour
    pool_size=5,         # Maintain 5 connections in pool
    max_overflow=10,     # Allow up to 10 overflow connections
    echo=False
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)


def get_db():
    """Get database session with proper error handling"""
    db = SessionLocal()
    try:
        yield db
    except exc.SQLAlchemyError as e:
        logger.error(f"Database error: {e}")
        db.rollback()
        raise
    except Exception as e:
        logger.error(f"Unexpected error in database session: {e}")
        db.rollback()
        raise
    finally:
        db.close()

