"""
AI 브리핑 API

GET  /briefing/today    — 오늘 브리핑 반환 (캐시된 분석 결과 사용)
POST /briefing/generate — 뉴스 수집 → AI 분석 → DB 저장 → 브리핑 반환 (강제 재생성)
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import AiAnalysis, Portfolio
from backend.services import ai_service, news_service, stock_service, rsi_service

router = APIRouter()


# ────────────────────────────────────────────
# 스키마
# ────────────────────────────────────────────

class SellTarget(BaseModel):
    price: float
    reason: str
    horizon: str


class StockAnalysisItem(BaseModel):
    stock_id: int
    ticker: str
    name: str
    market: str
    signal: str
    predicted_change_pct: float | None
    reason: str | None
    risk_level: str | None
    rsi_value: float | None
    volatility: str | None = None
    sell_target: SellTarget | None = None
    key_factors: list[str] = []


class BriefingResponse(BaseModel):
    date: str
    summary: str                          # 전체 브리핑 텍스트
    analyses: list[StockAnalysisItem]     # 종목별 분석


# ────────────────────────────────────────────
# 엔드포인트
# ────────────────────────────────────────────

@router.get("/today", response_model=BriefingResponse)
def get_today_briefing(db: Session = Depends(get_db)):
    """오늘 날짜의 분석 결과를 DB에서 조회해 반환 (빠름)"""
    today = str(date.today())
    analyses = (
        db.query(AiAnalysis)
        .filter(AiAnalysis.date == today)
        .all()
    )
    if not analyses:
        raise HTTPException(
            status_code=404,
            detail="오늘 브리핑이 없습니다. POST /briefing/generate 를 먼저 실행하세요.",
        )

    import json as _json
    items = []
    summary = ""
    for i, a in enumerate(analyses):
        stock = db.query(Portfolio).filter(Portfolio.id == a.stock_id).first()
        raw = {}
        try:
            raw = _json.loads(a.raw_response or "{}")
        except Exception:
            pass
        if i == 0:
            summary = raw.get("summary", a.raw_response or "")
        st = raw.get("sell_target")
        items.append(StockAnalysisItem(
            stock_id=a.stock_id,
            ticker=stock.ticker if stock else "?",
            name=stock.name if stock else "?",
            market=stock.market if stock else "?",
            signal=a.signal or "HOLD",
            predicted_change_pct=a.predicted_change_pct,
            reason=a.reason,
            risk_level=raw.get("risk_level"),
            rsi_value=a.rsi_value,
            volatility=raw.get("volatility"),
            sell_target=SellTarget(**st) if isinstance(st, dict) and st.get("price") else None,
            key_factors=raw.get("key_factors", []),
        ))

    return BriefingResponse(date=today, summary=summary, analyses=items)


@router.post("/generate", response_model=BriefingResponse)
def generate_briefing(db: Session = Depends(get_db)):
    """
    전체 브리핑 생성 파이프라인:
    1. 보유 종목 조회
    2. 뉴스 수집 & 캐시
    3. 종목별 현재가/RSI 조회
    4. 종목별 Claude AI 분석
    5. 전체 브리핑 요약 생성
    6. ai_analysis 테이블 저장
    """
    today = str(date.today())
    stocks = db.query(Portfolio).all()
    if not stocks:
        raise HTTPException(status_code=404, detail="보유 종목이 없습니다.")

    # 1. 뉴스 수집
    ticker_list = [(s.ticker, s.name, s.market) for s in stocks]
    news_service.fetch_and_cache_news(ticker_list, db)
    cached_news = news_service.get_cached_news(db)
    news_titles = [n["title"] for n in cached_news if n.get("title")]

    # 2. 종목별 분석
    portfolio_summaries = []
    analysis_rows = []

    for stock in stocks:
        try:
            data = stock_service.get_stock(stock.ticker, stock.market)
            rsi = rsi_service.calculate_rsi_from_history(data["history"])
            current_price = data["current_price"]
        except Exception:
            rsi = None
            current_price = stock.buy_price  # 조회 실패 시 매입가 유지

        # 해당 종목 관련 뉴스만 필터링
        stock_news = [
            n["title"]
            for n in cached_news
            if stock.ticker in (n.get("related_tickers") or [])
        ]
        if not stock_news:
            stock_news = news_titles[:5]  # 관련 뉴스 없으면 전체 상위 5건

        result = ai_service.analyze_stock(
            ticker=stock.ticker,
            name=stock.name,
            market=stock.market,
            buy_price=stock.buy_price,
            current_price=current_price,
            rsi=rsi,
            news_summaries=stock_news,
        )

        portfolio_summaries.append({
            "ticker": stock.ticker,
            "name": stock.name,
            **result,
        })

        import json as _json
        analysis_rows.append(AiAnalysis(
            stock_id=stock.id,
            date=today,
            signal=result.get("signal"),
            reason=result.get("reason"),
            rsi_value=rsi,
            predicted_change_pct=result.get("predicted_change_pct"),
            raw_response=_json.dumps({
                "risk_level": result.get("risk_level"),
                "volatility": result.get("volatility"),
                "sell_target": result.get("sell_target"),
                "key_factors": result.get("key_factors", []),
                "news": stock_news[:5],
            }, ensure_ascii=False),
        ))

    # 3. 전체 브리핑 요약
    summary_text = ai_service.generate_briefing(portfolio_summaries, news_titles)

    # 첫 번째 row의 raw_response에 전체 요약 텍스트 추가
    if analysis_rows:
        import json as _json
        try:
            first = _json.loads(analysis_rows[0].raw_response or "{}")
        except Exception:
            first = {}
        first["summary"] = summary_text
        analysis_rows[0].raw_response = _json.dumps(first, ensure_ascii=False)

    # 4. 오늘 기존 분석 삭제 후 저장 (재생성 시 중복 방지)
    db.query(AiAnalysis).filter(AiAnalysis.date == today).delete()
    db.add_all(analysis_rows)
    db.commit()

    # 응답 조립
    items = []
    for stock, row, summary in zip(stocks, analysis_rows, portfolio_summaries):
        items.append(StockAnalysisItem(
            stock_id=stock.id,
            ticker=stock.ticker,
            name=stock.name,
            market=stock.market,
            signal=summary.get("signal", "HOLD"),
            predicted_change_pct=summary.get("predicted_change_pct"),
            reason=summary.get("reason"),
            risk_level=summary.get("risk_level"),
            rsi_value=row.rsi_value,
        ))

    return BriefingResponse(date=today, summary=summary_text, analyses=items)


@router.post("/analyze/{stock_id}", response_model=StockAnalysisItem)
def analyze_single(stock_id: int, db: Session = Depends(get_db)):
    """
    단일 종목 즉시 AI 분석 — 종목 상세화면에서 호출
    브리핑 전체 생성 없이 해당 종목만 분석해 반환 및 저장
    """
    import json as _json
    today = str(date.today())

    stock = db.query(Portfolio).filter(Portfolio.id == stock_id).first()
    if not stock:
        raise HTTPException(status_code=404, detail="종목을 찾을 수 없습니다.")

    # 뉴스 수집 (캐시 우선)
    cached_news = news_service.get_cached_news(db)
    if not cached_news:
        news_service.fetch_and_cache_news([(stock.ticker, stock.name, stock.market)], db)
        cached_news = news_service.get_cached_news(db)
    news_titles = [n["title"] for n in cached_news if n.get("title")]

    # 관련 뉴스 필터
    stock_news = [
        n["title"] for n in cached_news
        if stock.ticker in (n.get("related_tickers") or [])
    ] or news_titles[:5]

    # 현재가 / RSI
    try:
        data = stock_service.get_stock(stock.ticker, stock.market)
        rsi = rsi_service.calculate_rsi_from_history(data["history"])
        current_price = data["current_price"]
    except Exception:
        rsi = None
        current_price = stock.buy_price

    # AI 분석
    result = ai_service.analyze_stock(
        ticker=stock.ticker,
        name=stock.name,
        market=stock.market,
        buy_price=stock.buy_price,
        current_price=current_price,
        rsi=rsi,
        news_summaries=stock_news,
    )

    raw = _json.dumps({
        "risk_level": result.get("risk_level"),
        "volatility": result.get("volatility"),
        "sell_target": result.get("sell_target"),
        "key_factors": result.get("key_factors", []),
        "news": stock_news[:5],
    }, ensure_ascii=False)

    # 기존 오늘 분석 덮어쓰기
    existing = db.query(AiAnalysis).filter(
        AiAnalysis.stock_id == stock_id,
        AiAnalysis.date == today,
    ).first()
    if existing:
        existing.signal = result.get("signal")
        existing.reason = result.get("reason")
        existing.rsi_value = rsi
        existing.predicted_change_pct = result.get("predicted_change_pct")
        existing.raw_response = raw
    else:
        db.add(AiAnalysis(
            stock_id=stock_id, date=today,
            signal=result.get("signal"),
            reason=result.get("reason"),
            rsi_value=rsi,
            predicted_change_pct=result.get("predicted_change_pct"),
            raw_response=raw,
        ))
    db.commit()

    st = result.get("sell_target")
    return StockAnalysisItem(
        stock_id=stock_id,
        ticker=stock.ticker,
        name=stock.name,
        market=stock.market,
        signal=result.get("signal", "HOLD"),
        predicted_change_pct=result.get("predicted_change_pct"),
        reason=result.get("reason"),
        risk_level=result.get("risk_level"),
        rsi_value=rsi,
        volatility=result.get("volatility"),
        sell_target=SellTarget(**st) if isinstance(st, dict) and st.get("price") else None,
        key_factors=result.get("key_factors", []),
    )
