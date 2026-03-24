import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

_db_path = os.getenv("DB_PATH", "./aijusik.db")
DATABASE_URL = f"sqlite:///{_db_path}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # SQLite 단일 사용자 전제
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI 의존성 주입용 DB 세션"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """앱 시작 시 테이블 생성"""
    from backend import models  # noqa: F401 — 모델 import로 테이블 등록
    Base.metadata.create_all(bind=engine)
