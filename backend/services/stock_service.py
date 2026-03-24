"""
주식 데이터 조회 서비스
- 미국 주식: yfinance (15분 지연)
- 한국 주식: pykrx (당일 장 마감 후 종가 기준)
"""
import logging
import threading
from datetime import datetime, timedelta

import pandas as pd
import yfinance as yf
from pykrx import stock as krx

logger = logging.getLogger(__name__)

# ────────────────────────────────────────────
# KR 종목 이름 캐시 (당일 1회만 pykrx 호출)
# ────────────────────────────────────────────
_kr_name_cache: dict[str, str] = {}   # ticker -> name
_kr_cache_date: str = ""
_kr_cache_lock = threading.Lock()


def _get_kr_name_map() -> dict[str, str]:
    """KR 전체 종목 {ticker: name} 딕셔너리. 당일 최초 호출 시에만 pykrx 조회."""
    global _kr_name_cache, _kr_cache_date
    today = datetime.now().strftime("%Y%m%d")
    with _kr_cache_lock:
        if _kr_cache_date == today and _kr_name_cache:
            return _kr_name_cache
        try:
            tickers = krx.get_market_ticker_list(today, market="ALL")
            mapping: dict[str, str] = {}
            for ticker in tickers:
                try:
                    name = krx.get_market_ticker_name(ticker)
                    mapping[ticker] = name
                except Exception:
                    pass
            _kr_name_cache = mapping
            _kr_cache_date = today
        except Exception:
            pass
        return _kr_name_cache


# ────────────────────────────────────────────
# 공통 반환 스키마 (dict)
# {
#   ticker, name, market, current_price,
#   prev_close, change_pct,
#   history: [{date, open, high, low, close, volume}, ...]
# }
# ────────────────────────────────────────────


def get_us_stock(ticker: str) -> dict:
    """yfinance로 미국 주식 현재가 + 60일 일봉 조회"""
    t = yf.Ticker(ticker.upper())

    try:
        hist = t.history(period="3mo")
    except Exception as e:
        logger.error(f"yfinance history 실패 ({ticker}): {e}")
        raise ValueError(f"yfinance: {ticker} 조회 실패 — {e}")

    if hist is None or hist.empty:
        raise ValueError(f"yfinance: {ticker} 데이터 없음 (빈 응답)")

    logger.info(f"yfinance {ticker}: {len(hist)}행, 컬럼={list(hist.columns)}")

    # multi-level column 처리 (yfinance 0.2+)
    if isinstance(hist.columns, pd.MultiIndex):
        hist.columns = hist.columns.get_level_values(0)

    # Close 컬럼 이름 정규화 (대소문자 대응)
    col_map = {c.lower(): c for c in hist.columns}
    close_col = col_map.get("close", "Close")

    history = _format_history_yf(hist)

    current_price: float = float(hist[close_col].iloc[-1])
    prev_close: float = float(hist[close_col].iloc[-2]) if len(hist) >= 2 else current_price
    change_pct: float = (
        ((current_price - prev_close) / prev_close * 100) if prev_close else 0.0
    )

    # 종목명 조회 (실패해도 ticker 사용)
    name = ticker.upper()
    try:
        info = t.fast_info
        name = getattr(info, "long_name", None) or getattr(info, "display_name", None) or ticker.upper()
    except Exception:
        pass

    return {
        "ticker": ticker.upper(),
        "name": name,
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


def search_stocks(query: str, market: str = "ALL") -> list[dict]:
    """종목명 또는 티커로 검색 — 자동완성용"""
    results: list[dict] = []
    q = query.lower()

    if market in ("KR", "ALL"):
        name_map = _get_kr_name_map()
        for ticker, name in name_map.items():
            if q in ticker.lower() or q in name.lower():
                results.append({"ticker": ticker, "name": name, "market": "KR"})
                if len(results) >= 10:
                    break

    if market in ("US", "ALL"):
        try:
            import httpx
            resp = httpx.get(
                "https://query2.finance.yahoo.com/v1/finance/search",
                params={"q": query, "lang": "en-US", "quotesCount": 8, "newsCount": 0},
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=5,
            )
            data = resp.json()
            for item in data.get("quotes", []):
                qtype = item.get("quoteType", "")
                if qtype not in ("EQUITY", "ETF"):
                    continue
                results.append({
                    "ticker": item.get("symbol", ""),
                    "name": item.get("longname") or item.get("shortname") or item.get("symbol", ""),
                    "market": "US",
                })
        except Exception:
            pass

    return results[:10]


def get_stock(ticker: str, market: str) -> dict:
    """market('KR'|'US') 에 따라 분기"""
    if market.upper() == "KR":
        return get_kr_stock(ticker)
    return get_us_stock(ticker)


def validate_ticker(ticker: str, market: str) -> dict | None:
    """티커 유효성 확인 + 종목명 반환. 없으면 None."""
    if market.upper() == "KR":
        # 1순위: 메모리 캐시 (서버 시작 후 빌드된 경우)
        cache = _get_kr_name_map()
        if cache:
            name = cache.get(ticker)
            if name:
                return {"ticker": ticker, "name": name, "market": "KR"}
            return None  # 캐시에 없으면 잘못된 티커

        # 2순위: OHLCV 조회로 존재 여부 + 이름 확인 (캐시 미완성 시 폴백)
        try:
            today = datetime.now().strftime("%Y%m%d")
            from_date = (datetime.now() - timedelta(days=10)).strftime("%Y%m%d")
            df = krx.get_market_ohlcv(from_date, today, ticker)
            if df.empty:
                return None
            name = _get_kr_stock_name(ticker)
            return {"ticker": ticker, "name": name, "market": "KR"}
        except Exception:
            return None
    else:
        try:
            t = yf.Ticker(ticker.upper())
            hist = t.history(period="5d")
            if hist.empty:
                return None
            # fast_info에서 이름 시도
            try:
                info = t.fast_info
                name = getattr(info, "long_name", None) or getattr(info, "display_name", None)
            except Exception:
                name = None
            return {"ticker": ticker.upper(), "name": name or ticker.upper(), "market": "US"}
        except Exception:
            return None


# ────────────────────────────────────────────
# 내부 헬퍼
# ────────────────────────────────────────────

def _format_history_yf(hist: pd.DataFrame) -> list[dict]:
    col_map = {c.lower(): c for c in hist.columns}
    records = []
    for idx, row in hist.iterrows():
        records.append({
            "date": str(idx.date()),
            "open":   round(float(row[col_map.get("open",   "Open")]),   4),
            "high":   round(float(row[col_map.get("high",   "High")]),   4),
            "low":    round(float(row[col_map.get("low",    "Low")]),    4),
            "close":  round(float(row[col_map.get("close",  "Close")]),  4),
            "volume": int(row[col_map.get("volume", "Volume")]),
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
