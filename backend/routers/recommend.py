"""
추천 5종목 API

GET  /recommend         — 오늘 추천 종목 (캐시 우선)
POST /recommend/generate — 강제 재생성 (뉴스 기반 Claude 분석)

?market=KR|US|ALL  (기본값: ALL)
"""
import json
from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import NewsCache
from backend.services import ai_service, news_service

router = APIRouter()

# 추천 결과는 별도 DB 테이블 없이 news_cache 의 특수 레코드로 저장
# source = "__recommend__", related_tickers = JSON 직렬화 결과
_RECOMMEND_SOURCE = "__recommend__"


class RecommendItem(BaseModel):
    ticker: str
    name: str
    market: str
    reason: str
    direction: str   # UP | DOWN


class RecommendResponse(BaseModel):
    date: str
    market: str
    items: list[RecommendItem]


# ────────────────────────────────────────────
# 엔드포인트
# ────────────────────────────────────────────

@router.get("", response_model=RecommendResponse)
def get_recommendations(
    market: str = Query("ALL", pattern="^(KR|US|ALL)$"),
    db: Session = Depends(get_db),
):
    """오늘 추천 종목 반환 (캐시 우선, 없으면 자동 생성)"""
    cached = _load_cached(db, market)
    if cached:
        return cached

    # 캐시 없으면 자동 생성
    return _run_generate(db, market)


@router.post("/generate", response_model=RecommendResponse)
def generate_recommendations(
    market: str = Query("ALL", pattern="^(KR|US|ALL)$"),
    db: Session = Depends(get_db),
):
    """추천 종목 강제 재생성"""
    return _run_generate(db, market)


# ────────────────────────────────────────────
# 내부 로직
# ────────────────────────────────────────────

def _run_generate(db: Session, market: str) -> RecommendResponse:
    today = str(date.today())

    # 오늘 캐시된 뉴스 사용 (없으면 빈 리스트)
    cached_news = news_service.get_cached_news(db)
    news_titles = [n["title"] for n in cached_news if n.get("title")]

    raw_items = ai_service.recommend_stocks(news_titles, market)

    items = [
        RecommendItem(
            ticker=i.get("ticker", ""),
            name=i.get("name", ""),
            market=i.get("market", market),
            reason=i.get("reason", ""),
            direction=i.get("direction", "UP"),
        )
        for i in raw_items
    ]

    # news_cache 에 결과 저장 (기존 오늘 추천 삭제 후 재저장)
    db.query(NewsCache).filter(
        NewsCache.source == _RECOMMEND_SOURCE,
        NewsCache.fetched_at.startswith(today),
    ).delete(synchronize_session=False)

    db.add(NewsCache(
        title=f"recommend_{market}",
        summary=json.dumps([i.model_dump() for i in items], ensure_ascii=False),
        url=None,
        published_at=today,
        related_tickers=json.dumps([i.ticker for i in items]),
        source=_RECOMMEND_SOURCE,
        fetched_at=today,
    ))
    db.commit()

    return RecommendResponse(date=today, market=market, items=items)


def _load_cached(db: Session, market: str) -> RecommendResponse | None:
    today = str(date.today())
    row = db.query(NewsCache).filter(
        NewsCache.source == _RECOMMEND_SOURCE,
        NewsCache.title == f"recommend_{market}",
        NewsCache.fetched_at.startswith(today),
    ).first()

    if not row or not row.summary:
        return None

    try:
        raw = json.loads(row.summary)
        items = [RecommendItem(**i) for i in raw]
        return RecommendResponse(date=today, market=market, items=items)
    except Exception:
        return None
