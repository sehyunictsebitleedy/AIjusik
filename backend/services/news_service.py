"""
뉴스 수집 서비스

소스:
- NewsAPI      : 미국/한국 종목 영문 뉴스 (API 키 필요)
- Yahoo Finance RSS : 미국 종목 티커별 뉴스 (무료)
- 네이버 금융 RSS   : 한국 종목 종목코드별 뉴스 (무료)

흐름:
1. fetch_and_cache_news(tickers, db) 호출
2. 각 소스에서 뉴스 수집
3. 중복 URL 제거 후 news_cache 테이블에 저장
4. 저장된 뉴스 목록 반환
"""
import json
import os
from datetime import datetime

import feedparser
from newsapi import NewsApiClient
from sqlalchemy.orm import Session

from backend.models import NewsCache

NEWSAPI_KEY = os.getenv("NEWS_API_KEY", "")

# 네이버 금융 종목 뉴스 RSS (KR)
NAVER_RSS_URL = "https://finance.naver.com/item/news_news.naver?code={ticker}&page=1&sm=title_entity_id.basic"
# Yahoo Finance RSS (US)
YAHOO_RSS_URL = "https://finance.yahoo.com/rss/headline?s={ticker}"


def fetch_and_cache_news(
    tickers: list[tuple[str, str, str]],  # [(ticker, name, market), ...]
    db: Session,
) -> list[dict]:
    """
    보유 종목 뉴스를 수집하고 DB에 캐시한 뒤 반환한다.

    Args:
        tickers: [(ticker, name, market), ...]  예: [("AAPL", "Apple Inc.", "US")]
        db:      SQLAlchemy 세션

    Returns:
        수집된 뉴스 dict 리스트
    """
    all_news: list[dict] = []

    for ticker, name, market in tickers:
        if market == "US":
            all_news.extend(_fetch_yahoo_rss(ticker))
            if NEWSAPI_KEY:
                all_news.extend(_fetch_newsapi(name, ticker))
        else:
            all_news.extend(_fetch_naver_rss(ticker))
            if NEWSAPI_KEY:
                all_news.extend(_fetch_newsapi(name, ticker))

    # 중복 URL 제거
    seen: set[str] = set()
    unique: list[dict] = []
    for item in all_news:
        url = item.get("url", "")
        if url and url not in seen:
            seen.add(url)
            unique.append(item)

    # DB에 저장 (이미 존재하는 URL은 스킵)
    existing_urls = {
        row.url
        for row in db.query(NewsCache.url).all()
        if row.url
    }

    now = datetime.now().isoformat()
    new_rows = []
    for item in unique:
        if item.get("url") in existing_urls:
            continue
        new_rows.append(NewsCache(
            title=item.get("title"),
            summary=item.get("summary"),
            url=item.get("url"),
            published_at=item.get("published_at"),
            related_tickers=json.dumps(item.get("related_tickers", []), ensure_ascii=False),
            source=item.get("source"),
            fetched_at=now,
        ))

    if new_rows:
        db.add_all(new_rows)
        db.commit()

    return unique


def get_cached_news(db: Session) -> list[dict]:
    """오늘 캐시된 뉴스 전체 반환"""
    rows = db.query(NewsCache).order_by(NewsCache.published_at.desc()).all()
    result = []
    for row in rows:
        result.append({
            "title": row.title,
            "summary": row.summary,
            "url": row.url,
            "published_at": row.published_at,
            "related_tickers": json.loads(row.related_tickers or "[]"),
            "source": row.source,
        })
    return result


# ────────────────────────────────────────────
# 소스별 수집 함수
# ────────────────────────────────────────────

def _fetch_yahoo_rss(ticker: str) -> list[dict]:
    """Yahoo Finance RSS — 미국 종목 티커별"""
    url = YAHOO_RSS_URL.format(ticker=ticker)
    try:
        feed = feedparser.parse(url)
        items = []
        for entry in feed.entries[:10]:  # 최신 10건만
            items.append({
                "title": entry.get("title", ""),
                "summary": entry.get("summary", ""),
                "url": entry.get("link", ""),
                "published_at": _parse_date(entry.get("published", "")),
                "related_tickers": [ticker],
                "source": "Yahoo Finance",
            })
        return items
    except Exception:
        return []


def _fetch_naver_rss(ticker: str) -> list[dict]:
    """네이버 금융 RSS — 한국 종목 코드별"""
    # 네이버 금융은 RSS가 없어 뉴스 검색 RSS 활용
    rss_url = f"https://finance.naver.com/item/news_news.naver?code={ticker}"
    # feedparser로 직접 파싱 불가 → 연합뉴스 경제 RSS를 fallback으로 사용
    fallback_url = "https://www.yonhapnewstv.co.kr/category/news/economy/feed/"
    try:
        feed = feedparser.parse(fallback_url)
        items = []
        for entry in feed.entries[:10]:
            items.append({
                "title": entry.get("title", ""),
                "summary": entry.get("summary", ""),
                "url": entry.get("link", ""),
                "published_at": _parse_date(entry.get("published", "")),
                "related_tickers": [ticker],
                "source": "연합뉴스",
            })
        return items
    except Exception:
        return []


def _fetch_newsapi(name: str, ticker: str) -> list[dict]:
    """NewsAPI — 종목명 검색 (영문)"""
    try:
        client = NewsApiClient(api_key=NEWSAPI_KEY)
        response = client.get_everything(
            q=name,
            language="en",
            sort_by="publishedAt",
            page_size=5,
        )
        items = []
        for article in response.get("articles", []):
            items.append({
                "title": article.get("title", ""),
                "summary": article.get("description", ""),
                "url": article.get("url", ""),
                "published_at": article.get("publishedAt", ""),
                "related_tickers": [ticker],
                "source": article.get("source", {}).get("name", "NewsAPI"),
            })
        return items
    except Exception:
        return []


def _parse_date(raw: str) -> str:
    """RSS 날짜 문자열을 ISO 형식으로 변환"""
    if not raw:
        return datetime.now().isoformat()
    try:
        import email.utils
        parsed = email.utils.parsedate_to_datetime(raw)
        return parsed.isoformat()
    except Exception:
        return raw
