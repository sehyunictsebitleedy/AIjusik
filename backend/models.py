from datetime import datetime
from sqlalchemy import Integer, Text, REAL, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


class Portfolio(Base):
    """보유 종목"""
    __tablename__ = "portfolio"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ticker: Mapped[str] = mapped_column(Text, nullable=False)           # 예: '005930', 'AAPL'
    name: Mapped[str] = mapped_column(Text, nullable=False)             # 예: '삼성전자'
    market: Mapped[str] = mapped_column(Text, nullable=False)           # 'KR' | 'US'
    buy_price: Mapped[float] = mapped_column(REAL, nullable=False)      # 매입 평균가
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)      # 보유 수량
    buy_date: Mapped[str | None] = mapped_column(Text, nullable=True)   # YYYY-MM-DD
    alert_threshold: Mapped[float] = mapped_column(REAL, default=-10.0) # 알람 임계값 (%)
    created_at: Mapped[str] = mapped_column(Text, default=lambda: datetime.now().isoformat())

    analyses: Mapped[list["AiAnalysis"]] = relationship("AiAnalysis", back_populates="stock", cascade="all, delete-orphan")
    alerts: Mapped[list["Alert"]] = relationship("Alert", back_populates="stock", cascade="all, delete-orphan")


class NewsCache(Base):
    """뉴스 캐시"""
    __tablename__ = "news_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[str | None] = mapped_column(Text)
    related_tickers: Mapped[str | None] = mapped_column(Text)  # JSON array 문자열
    source: Mapped[str | None] = mapped_column(Text)
    fetched_at: Mapped[str] = mapped_column(Text, default=lambda: datetime.now().isoformat())


class AiAnalysis(Base):
    """AI 분석 결과"""
    __tablename__ = "ai_analysis"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    stock_id: Mapped[int] = mapped_column(Integer, ForeignKey("portfolio.id"))
    date: Mapped[str | None] = mapped_column(Text)
    signal: Mapped[str | None] = mapped_column(Text)             # 'BUY' | 'HOLD' | 'SELL'
    reason: Mapped[str | None] = mapped_column(Text)
    rsi_value: Mapped[float | None] = mapped_column(REAL)
    predicted_change_pct: Mapped[float | None] = mapped_column(REAL)
    raw_response: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, default=lambda: datetime.now().isoformat())

    stock: Mapped["Portfolio"] = relationship("Portfolio", back_populates="analyses")


class Alert(Base):
    """알람 이력"""
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    stock_id: Mapped[int] = mapped_column(Integer, ForeignKey("portfolio.id"))
    alert_type: Mapped[str | None] = mapped_column(Text)         # 'AI_PREDICTION' | 'PRICE_REACHED'
    message: Mapped[str | None] = mapped_column(Text)
    triggered_at: Mapped[str] = mapped_column(Text, default=lambda: datetime.now().isoformat())
    is_sent: Mapped[int] = mapped_column(Integer, default=0)

    stock: Mapped["Portfolio"] = relationship("Portfolio", back_populates="alerts")


class PushToken(Base):
    """Expo 푸시 토큰 (단일 사용자 — 항상 id=1 로우만 사용)"""
    __tablename__ = "push_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    token: Mapped[str] = mapped_column(Text, nullable=False)      # ExponentPushToken[...]
    updated_at: Mapped[str] = mapped_column(Text, default=lambda: datetime.now().isoformat())
