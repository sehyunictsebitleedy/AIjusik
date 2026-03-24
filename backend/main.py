import logging
import os
import threading
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))  # .env 로드

from backend.database import init_db, SessionLocal
from backend.routers import alerts, briefing, portfolio, recommend, stocks
from backend.scheduler import setup_scheduler
from backend.services.cleanup_service import run_cleanup
from backend.services.stock_service import _get_kr_name_map

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. DB 테이블 초기화
    init_db()
    logger.info("DB 초기화 완료")

    # 2. 앱 시작 시 오래된 데이터 정리
    db = SessionLocal()
    try:
        result = run_cleanup(db, days=1)
        logger.info(f"startup cleanup: {result}")
    finally:
        db.close()

    # 3. KR 종목 캐시 백그라운드 빌드 (검색 첫 응답 속도 개선)
    def _warm_kr_cache():
        try:
            result = _get_kr_name_map()
            logger.info(f"KR 종목 캐시 완료: {len(result)}개")
        except Exception as e:
            logger.warning(f"KR 캐시 빌드 실패: {e}")
    threading.Thread(target=_warm_kr_cache, daemon=True).start()

    # 4. 스케줄러 시작
    scheduler = setup_scheduler()
    scheduler.start()
    logger.info("스케줄러 시작 완료")

    yield

    # 4. 종료 시 스케줄러 정지
    scheduler.shutdown(wait=False)
    logger.info("스케줄러 종료")


app = FastAPI(
    title="AI 개인 투자 어시스턴트",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 개인 앱 — 단일 사용자 전제
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stocks.router,    prefix="/stocks",    tags=["stocks"])
app.include_router(portfolio.router, prefix="/portfolio", tags=["portfolio"])
app.include_router(briefing.router,  prefix="/briefing",  tags=["briefing"])
app.include_router(recommend.router, prefix="/recommend", tags=["recommend"])
app.include_router(alerts.router,    prefix="/alerts",    tags=["alerts"])


@app.get("/health")
def health():
    return {"status": "ok"}
