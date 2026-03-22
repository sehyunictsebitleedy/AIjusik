"""
낡은 데이터 자동 삭제 서비스

삭제 대상 및 기준:
- news_cache   : fetched_at 기준 1일 초과
- ai_analysis  : created_at 기준 1일 초과
- alerts       : triggered_at 기준 1일 초과 + is_sent=1 (미발송 알람은 보존)

Portfolio(보유 종목)는 삭제하지 않음.
"""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from backend.models import AiAnalysis, Alert, NewsCache


def run_cleanup(db: Session, days: int = 1) -> dict[str, int]:
    """
    오래된 데이터를 삭제하고 삭제 건수를 반환한다.

    Args:
        db:   SQLAlchemy 세션
        days: 기준 일수 (기본 1일 — 하루 지난 데이터 삭제)

    Returns:
        {"news_cache": n, "ai_analysis": n, "alerts": n}
    """
    cutoff = (datetime.now() - timedelta(days=days)).isoformat()

    news_deleted = (
        db.query(NewsCache)
        .filter(NewsCache.fetched_at < cutoff)
        .delete(synchronize_session=False)
    )

    analysis_deleted = (
        db.query(AiAnalysis)
        .filter(AiAnalysis.created_at < cutoff)
        .delete(synchronize_session=False)
    )

    # 미발송(is_sent=0) 알람은 보존 — 아직 전송되지 않은 알람은 삭제하면 안 됨
    alert_deleted = (
        db.query(Alert)
        .filter(Alert.triggered_at < cutoff, Alert.is_sent == 1)
        .delete(synchronize_session=False)
    )

    db.commit()

    return {
        "news_cache": news_deleted,
        "ai_analysis": analysis_deleted,
        "alerts": alert_deleted,
    }
