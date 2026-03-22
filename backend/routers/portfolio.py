"""
보유 종목 CRUD API

POST   /portfolio          — 종목 추가
GET    /portfolio          — 전체 목록 (DB 정보만, 빠름)
GET    /portfolio/live     — 전체 목록 + 현재가/손익/RSI (외부 API 호출, 느림)
GET    /portfolio/{id}     — 특정 종목 조회
GET    /portfolio/{id}/live — 특정 종목 + 현재가/손익/RSI
PUT    /portfolio/{id}     — 종목 정보 수정 (매입가, 수량, 임계값 등)
DELETE /portfolio/{id}     — 종목 삭제
"""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Portfolio
from backend.services.stock_service import get_stock
from backend.services.profit_service import calc_profit
from backend.services.rsi_service import calculate_rsi_from_history, get_rsi_signal

router = APIRouter()


# ────────────────────────────────────────────
# Pydantic 스키마
# ────────────────────────────────────────────

class PortfolioCreate(BaseModel):
    ticker: str = Field(..., examples=["005930", "AAPL"])
    name: str = Field(..., examples=["삼성전자", "Apple Inc."])
    market: str = Field(..., pattern="^(KR|US)$", examples=["KR", "US"])
    buy_price: float = Field(..., gt=0, description="매입 평균가")
    quantity: int = Field(..., gt=0, description="보유 수량")
    buy_date: str | None = Field(None, examples=["2024-01-15"])
    alert_threshold: float = Field(-10.0, description="하락 알람 임계값 (%)")


class PortfolioUpdate(BaseModel):
    name: str | None = None
    buy_price: float | None = Field(None, gt=0)
    quantity: int | None = Field(None, gt=0)
    buy_date: str | None = None
    alert_threshold: float | None = None


class PortfolioResponse(BaseModel):
    id: int
    ticker: str
    name: str
    market: str
    buy_price: float
    quantity: int
    buy_date: str | None
    alert_threshold: float
    created_at: str

    model_config = {"from_attributes": True}


class LiveStockResponse(BaseModel):
    """현재가 + 손익 + RSI 포함 응답"""
    id: int
    ticker: str
    name: str
    market: str
    buy_price: float
    quantity: int
    alert_threshold: float
    # 현재가 정보
    current_price: float
    change_pct: float        # 당일 등락률 (%)
    # 손익
    buy_value: float         # 매입금액
    current_value: float     # 평가금액
    profit_loss: float       # 평가손익
    return_pct: float        # 수익률 (%)
    # RSI
    rsi: float | None
    rsi_signal: str          # 'OVERSOLD' | 'NEUTRAL' | 'OVERBOUGHT' | 'UNKNOWN'
    error: str | None = None  # 조회 실패 시 메시지


# ────────────────────────────────────────────
# 엔드포인트
# ────────────────────────────────────────────

@router.post("", response_model=PortfolioResponse, status_code=201)
def add_stock(body: PortfolioCreate, db: Session = Depends(get_db)):
    """종목 추가"""
    # 동일 티커 중복 방지
    existing = db.query(Portfolio).filter(
        Portfolio.ticker == body.ticker,
        Portfolio.market == body.market,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"{body.ticker} 이미 포트폴리오에 존재합니다.")

    stock = Portfolio(
        ticker=body.ticker.upper() if body.market == "US" else body.ticker,
        name=body.name,
        market=body.market,
        buy_price=body.buy_price,
        quantity=body.quantity,
        buy_date=body.buy_date,
        alert_threshold=body.alert_threshold,
        created_at=datetime.now().isoformat(),
    )
    db.add(stock)
    db.commit()
    db.refresh(stock)
    return stock


@router.get("", response_model=list[PortfolioResponse])
def list_stocks(db: Session = Depends(get_db)):
    """전체 보유 종목 목록 (DB 정보만, 빠름)"""
    return db.query(Portfolio).order_by(Portfolio.created_at).all()


@router.get("/live", response_model=list[LiveStockResponse])
async def list_stocks_live(db: Session = Depends(get_db)):
    """전체 보유 종목 + 현재가/손익/RSI (외부 API 병렬 조회)"""
    stocks = db.query(Portfolio).order_by(Portfolio.created_at).all()
    if not stocks:
        return []

    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor() as pool:
        tasks = [
            loop.run_in_executor(pool, _fetch_live_data, s)
            for s in stocks
        ]
        results = await asyncio.gather(*tasks)

    return list(results)


@router.get("/{stock_id}", response_model=PortfolioResponse)
def get_stock_by_id(stock_id: int, db: Session = Depends(get_db)):
    """특정 종목 조회 (DB 정보만)"""
    stock = _get_or_404(db, stock_id)
    return stock


@router.get("/{stock_id}/live", response_model=LiveStockResponse)
async def get_stock_live(stock_id: int, db: Session = Depends(get_db)):
    """특정 종목 + 현재가/손익/RSI"""
    stock = _get_or_404(db, stock_id)
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor() as pool:
        result = await loop.run_in_executor(pool, _fetch_live_data, stock)
    return result


@router.put("/{stock_id}", response_model=PortfolioResponse)
def update_stock(stock_id: int, body: PortfolioUpdate, db: Session = Depends(get_db)):
    """종목 정보 수정 (변경된 필드만 반영)"""
    stock = _get_or_404(db, stock_id)

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(stock, field, value)

    db.commit()
    db.refresh(stock)
    return stock


@router.delete("/{stock_id}", status_code=204)
def delete_stock(stock_id: int, db: Session = Depends(get_db)):
    """종목 삭제 (관련 분석/알람 데이터도 cascade 삭제됨)"""
    stock = _get_or_404(db, stock_id)
    db.delete(stock)
    db.commit()


# ────────────────────────────────────────────
# 내부 헬퍼
# ────────────────────────────────────────────

def _get_or_404(db: Session, stock_id: int) -> Portfolio:
    stock = db.query(Portfolio).filter(Portfolio.id == stock_id).first()
    if not stock:
        raise HTTPException(status_code=404, detail="종목을 찾을 수 없습니다.")
    return stock


def _fetch_live_data(stock: Portfolio) -> LiveStockResponse:
    """종목 1개에 대해 현재가 조회 + 손익 + RSI 계산 (동기, ThreadPoolExecutor 에서 실행)"""
    try:
        data = get_stock(stock.ticker, stock.market)

        profit = calc_profit(
            buy_price=stock.buy_price,
            quantity=stock.quantity,
            current_price=data["current_price"],
            change_pct=data["change_pct"],
            ticker=stock.ticker,
            market=stock.market,
        )

        rsi = calculate_rsi_from_history(data["history"])
        rsi_signal = get_rsi_signal(rsi)

        return LiveStockResponse(
            id=stock.id,
            ticker=stock.ticker,
            name=stock.name,
            market=stock.market,
            buy_price=stock.buy_price,
            quantity=stock.quantity,
            alert_threshold=stock.alert_threshold,
            current_price=profit.current_price,
            change_pct=profit.change_pct,
            buy_value=profit.buy_value,
            current_value=profit.current_value,
            profit_loss=profit.profit_loss,
            return_pct=profit.return_pct,
            rsi=rsi,
            rsi_signal=rsi_signal,
        )

    except Exception as e:
        # 개별 종목 조회 실패 시 전체를 막지 않고 error 필드로 표시
        return LiveStockResponse(
            id=stock.id,
            ticker=stock.ticker,
            name=stock.name,
            market=stock.market,
            buy_price=stock.buy_price,
            quantity=stock.quantity,
            alert_threshold=stock.alert_threshold,
            current_price=0.0,
            change_pct=0.0,
            buy_value=stock.buy_price * stock.quantity,
            current_value=0.0,
            profit_loss=0.0,
            return_pct=0.0,
            rsi=None,
            rsi_signal="UNKNOWN",
            error=str(e),
        )
