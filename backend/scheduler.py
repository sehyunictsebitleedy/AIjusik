"""
APScheduler 작업 정의

작업 목록 (CLAUDE.md 기준):
┌─────────────────────────┬─────────────────────────────────────────┬──────────────────────────────┐
│ 작업                    │ 주기                                    │ 설명                         │
├─────────────────────────┼─────────────────────────────────────────┼──────────────────────────────┤
│ job_fetch_news          │ 매일 07:30 KST                          │ 뉴스 수집 및 캐시 저장       │
│ job_run_briefing        │ 매일 08:00 KST                          │ AI 브리핑 생성 + 추천 5종목  │
│ job_run_ai_alert        │ 매일 08:05 KST                          │ AI 예측 기반 알람 생성       │
│ job_check_price_alert   │ 30분마다 (KR: 09:00~15:30 / US: 통합)  │ 실시간 시세 알람 체크        │
│ job_cleanup             │ 매일 00:05 KST                          │ 하루 지난 데이터 삭제        │
└─────────────────────────┴─────────────────────────────────────────┴──────────────────────────────┘
"""
import logging
import os

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from backend.database import SessionLocal
from backend.models import Portfolio
from backend.services import news_service, alert_service
from backend.services.cleanup_service import run_cleanup
from backend.services.push_service import send_pending_alerts

logger = logging.getLogger(__name__)

TIMEZONE = os.getenv("SCHEDULER_TIMEZONE", "Asia/Seoul")

scheduler = AsyncIOScheduler(timezone=TIMEZONE)


# ────────────────────────────────────────────
# 작업 함수
# ────────────────────────────────────────────

def job_fetch_news():
    """07:30 — 뉴스 수집 및 DB 캐시"""
    logger.info("[scheduler] job_fetch_news 시작")
    db = SessionLocal()
    try:
        stocks = db.query(Portfolio).all()
        tickers = [(s.ticker, s.name, s.market) for s in stocks]
        result = news_service.fetch_and_cache_news(tickers, db)
        logger.info(f"[scheduler] 뉴스 수집 완료: {len(result)}건")
    except Exception as e:
        logger.error(f"[scheduler] job_fetch_news 실패: {e}")
    finally:
        db.close()


def job_run_briefing():
    """08:00 — AI 브리핑 생성 + 추천 5종목"""
    logger.info("[scheduler] job_run_briefing 시작")
    db = SessionLocal()
    try:
        # briefing router 의 generate_briefing 로직을 직접 호출
        from backend.routers.briefing import generate_briefing
        result = generate_briefing(db)
        logger.info(f"[scheduler] 브리핑 생성 완료: {len(result.analyses)}종목")

        # 추천 5종목도 함께 갱신
        from backend.routers.recommend import _run_generate
        _run_generate(db, "ALL")
        logger.info("[scheduler] 추천 종목 갱신 완료")
    except Exception as e:
        logger.error(f"[scheduler] job_run_briefing 실패: {e}")
    finally:
        db.close()


def job_run_ai_alert():
    """08:05 — AI 예측 기반 알람 생성"""
    logger.info("[scheduler] job_run_ai_alert 시작")
    db = SessionLocal()
    try:
        created = alert_service.check_ai_prediction_alerts(db)
        logger.info(f"[scheduler] AI 알람 생성: {len(created)}건")
    except Exception as e:
        logger.error(f"[scheduler] job_run_ai_alert 실패: {e}")
    finally:
        db.close()


def job_check_price_alert():
    """30분마다 — 실시간 시세 알람 체크 + 즉시 푸시 발송"""
    logger.info("[scheduler] job_check_price_alert 시작")
    db = SessionLocal()
    try:
        created = alert_service.check_price_alerts(db)
        if created:
            logger.info(f"[scheduler] 시세 알람 생성: {len(created)}건")
            result = send_pending_alerts(db)
            logger.info(f"[scheduler] 푸시 발송: {result}")
    except Exception as e:
        logger.error(f"[scheduler] job_check_price_alert 실패: {e}")
    finally:
        db.close()


def job_send_pending_push():
    """08:10 — AI 알람 생성 직후 미발송 알람 일괄 푸시"""
    logger.info("[scheduler] job_send_pending_push 시작")
    db = SessionLocal()
    try:
        result = send_pending_alerts(db)
        logger.info(f"[scheduler] 푸시 발송 완료: {result}")
    except Exception as e:
        logger.error(f"[scheduler] job_send_pending_push 실패: {e}")
    finally:
        db.close()


def job_cleanup():
    """00:05 — 하루 지난 캐시 데이터 삭제"""
    logger.info("[scheduler] job_cleanup 시작")
    db = SessionLocal()
    try:
        result = run_cleanup(db, days=1)
        logger.info(f"[scheduler] cleanup 완료: {result}")
    except Exception as e:
        logger.error(f"[scheduler] job_cleanup 실패: {e}")
    finally:
        db.close()


# ────────────────────────────────────────────
# 스케줄러 등록
# ────────────────────────────────────────────

def setup_scheduler() -> AsyncIOScheduler:
    """모든 작업을 스케줄러에 등록하고 반환"""

    # 매일 00:05 — 정리
    scheduler.add_job(
        job_cleanup,
        CronTrigger(hour=0, minute=5, timezone=TIMEZONE),
        id="job_cleanup",
        replace_existing=True,
    )

    # 매일 07:30 — 뉴스 수집
    scheduler.add_job(
        job_fetch_news,
        CronTrigger(hour=7, minute=30, timezone=TIMEZONE),
        id="job_fetch_news",
        replace_existing=True,
    )

    # 매일 08:00 — AI 브리핑
    scheduler.add_job(
        job_run_briefing,
        CronTrigger(hour=8, minute=0, timezone=TIMEZONE),
        id="job_run_briefing",
        replace_existing=True,
    )

    # 매일 08:05 — AI 예측 알람
    scheduler.add_job(
        job_run_ai_alert,
        CronTrigger(hour=8, minute=5, timezone=TIMEZONE),
        id="job_run_ai_alert",
        replace_existing=True,
    )

    # 30분마다 — 시세 알람 + 즉시 푸시 (alert_service 내부에서 장 시간 필터링)
    scheduler.add_job(
        job_check_price_alert,
        IntervalTrigger(minutes=30, timezone=TIMEZONE),
        id="job_check_price_alert",
        replace_existing=True,
    )

    # 매일 08:10 — AI 알람 생성 직후 미발송 알람 일괄 푸시
    scheduler.add_job(
        job_send_pending_push,
        CronTrigger(hour=8, minute=10, timezone=TIMEZONE),
        id="job_send_pending_push",
        replace_existing=True,
    )

    return scheduler
