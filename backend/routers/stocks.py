"""
주식 데이터 API
GET /stocks/{market}/{ticker}  — 현재가 + 일봉 히스토리
GET /stocks/{market}/{ticker}/price — 현재가만 (간단 조회)
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.stock_service import get_stock

router = APIRouter()


class PriceResponse(BaseModel):
    ticker: str
    name: str
    market: str
    current_price: float
    prev_close: float
    change_pct: float


class HistoryItem(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int


class StockResponse(PriceResponse):
    history: list[HistoryItem]


@router.get("/{market}/{ticker}", response_model=StockResponse)
def get_stock_data(market: str, ticker: str):
    """현재가 + 60일 일봉 히스토리 반환"""
    market = market.upper()
    if market not in ("KR", "US"):
        raise HTTPException(status_code=400, detail="market은 KR 또는 US")
    try:
        data = get_stock(ticker, market)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"데이터 조회 실패: {e}")
    return data


@router.get("/{market}/{ticker}/price", response_model=PriceResponse)
def get_price_only(market: str, ticker: str):
    """현재가만 간단 조회 (히스토리 제외)"""
    market = market.upper()
    if market not in ("KR", "US"):
        raise HTTPException(status_code=400, detail="market은 KR 또는 US")
    try:
        data = get_stock(ticker, market)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"데이터 조회 실패: {e}")
    return data
