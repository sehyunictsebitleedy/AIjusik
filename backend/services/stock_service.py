"""
주식 데이터 조회 서비스
- 미국 주식: yfinance (15분 지연)
- 한국 주식: pykrx (당일 장 마감 후 종가 기준)
"""
from datetime import datetime, timedelta

import pandas as pd
import yfinance as yf
from pykrx import stock as krx


# ────────────────────────────────────────────
# 공통 반환 스키마 (dict)
# {
#   ticker, name, market, current_price,
#   prev_close, change_pct,
#   history: [{date, open, high, low, close, volume}, ...]
# }
# ────────────────────────────────────────────


def get_us_stock(ticker: str) -> dict:
    """yfinance로 미국 주식 현재가 + 14일 일봉 조회"""
    t = yf.Ticker(ticker)
    info = t.fast_info  # 빠른 메타 조회

    current_price: float = info.last_price or 0.0
    prev_close: float = info.previous_close or 0.0
    change_pct: float = (
        ((current_price - prev_close) / prev_close * 100) if prev_close else 0.0
    )

    hist = t.history(period="60d", interval="1d")
    history = _format_history_yf(hist)

    return {
        "ticker": ticker.upper(),
        "name": info.exchange or ticker,  # fast_info에 종목명 없음 → 별도 조회 생략
        "market": "US",
        "current_price": round(current_price, 4),
        "prev_close": round(prev_close, 4),
        "change_pct": round(change_pct, 2),
        "history": history,
    }


def get_us_stock_name(ticker: str) -> str:
    """yfinance에서 종목 정식 명칭 조회 (느림 — 필요 시만 호출)"""
    t = yf.Ticker(ticker)
    return t.info.get("longName") or t.info.get("shortName") or ticker


def get_kr_stock(ticker: str) -> dict:
    """pykrx로 한국 주식 현재가(당일 또는 전일 종가) + 60일 일봉 조회"""
    today = datetime.now().strftime("%Y%m%d")
    from_date = (datetime.now() - timedelta(days=90)).strftime("%Y%m%d")

    # 당일 또는 가장 최근 영업일 OHLCV
    df = krx.get_market_ohlcv(from_date, today, ticker)
    if df.empty:
        raise ValueError(f"pykrx: {ticker} 데이터 없음")

    df = df.dropna()
    latest = df.iloc[-1]
    prev = df.iloc[-2] if len(df) >= 2 else latest

    current_price: float = float(latest["종가"])
    prev_close: float = float(prev["종가"])
    change_pct: float = (
        ((current_price - prev_close) / prev_close * 100) if prev_close else 0.0
    )

    # 종목명
    name = _get_kr_stock_name(ticker)

    history = _format_history_krx(df.tail(60))

    return {
        "ticker": ticker,
        "name": name,
        "market": "KR",
        "current_price": round(current_price, 0),
        "prev_close": round(prev_close, 0),
        "change_pct": round(change_pct, 2),
        "history": history,
    }


def get_stock(ticker: str, market: str) -> dict:
    """market('KR'|'US') 에 따라 분기"""
    if market.upper() == "KR":
        return get_kr_stock(ticker)
    return get_us_stock(ticker)


# ────────────────────────────────────────────
# 내부 헬퍼
# ────────────────────────────────────────────

def _format_history_yf(hist: pd.DataFrame) -> list[dict]:
    records = []
    for idx, row in hist.iterrows():
        records.append({
            "date": str(idx.date()),
            "open": round(float(row["Open"]), 4),
            "high": round(float(row["High"]), 4),
            "low": round(float(row["Low"]), 4),
            "close": round(float(row["Close"]), 4),
            "volume": int(row["Volume"]),
        })
    return records


def _format_history_krx(df: pd.DataFrame) -> list[dict]:
    records = []
    for idx, row in df.iterrows():
        records.append({
            "date": str(idx.date()),
            "open": int(row["시가"]),
            "high": int(row["고가"]),
            "low": int(row["저가"]),
            "close": int(row["종가"]),
            "volume": int(row["거래량"]),
        })
    return records


def _get_kr_stock_name(ticker: str) -> str:
    try:
        today = datetime.now().strftime("%Y%m%d")
        df = krx.get_market_ticker_name(ticker)
        return df if isinstance(df, str) else ticker
    except Exception:
        return ticker
