"""
알람 트리거 서비스

알람 종류:
1. AI_PREDICTION  — 브리핑 생성 후 predicted_change_pct가 threshold 초과 시
2. PRICE_REACHED  — 장 중 현재가가 매입가 대비 threshold 도달 시

알람 레코드를 DB(alerts 테이블)에 is_sent=0 으로 저장.
실제 푸시 발송은 8단계 Expo Push 연동에서 처리.
"""
from datetime import datetime, timezone, timedelta

from sqlalchemy.orm import Session

from backend.models import Alert, AiAnalysis, Portfolio
from backend.services.stock_service import get_stock

# 한국 시간 (KST = UTC+9)
KST = timezone(timedelta(hours=9))
# 미국 동부 시간 (EST = UTC-5, EDT = UTC-4 — 단순화: EST 기준)
EST = timezone(timedelta(hours=-5))


# ────────────────────────────────────────────
# 1. AI 예측 알람
# ────────────────────────────────────────────

def check_ai_prediction_alerts(db: Session) -> list[Alert]:
    """
    오늘 AI 분석 결과 중 predicted_change_pct가 종목별 threshold 초과 시 알람 생성.

    스케줄: 매일 08:05 (브리핑 생성 직후)
    """
    from datetime import date
    today = str(date.today())

    analyses = db.query(AiAnalysis).filter(AiAnalysis.date == today).all()
    created: list[Alert] = []

    for analysis in analyses:
        stock = db.query(Portfolio).filter(Portfolio.id == analysis.stock_id).first()
        if not stock or analysis.predicted_change_pct is None:
            continue

        # 예측 하락률이 임계값 초과 여부 (임계값은 음수)
        if analysis.predicted_change_pct <= stock.alert_threshold:
            # 오늘 동일 종목 AI 알람 중복 방지
            already = db.query(Alert).filter(
                Alert.stock_id == stock.id,
                Alert.alert_type == "AI_PREDICTION",
                Alert.triggered_at.startswith(today),
            ).first()
            if already:
                continue

            msg = (
                f"[AI 경보] {stock.name}({stock.ticker}) "
                f"예측 등락률 {analysis.predicted_change_pct:+.1f}% "
                f"(임계값 {stock.alert_threshold:+.1f}%)\n"
                f"📌 {analysis.reason or ''}"
            )
            alert = Alert(
                stock_id=stock.id,
                alert_type="AI_PREDICTION",
                message=msg,
                triggered_at=datetime.now().isoformat(),
                is_sent=0,
            )
            db.add(alert)
            created.append(alert)

    if created:
        db.commit()

    return created


# ────────────────────────────────────────────
# 2. 실시간 시세 알람
# ────────────────────────────────────────────

def check_price_alerts(db: Session) -> list[Alert]:
    """
    장 중 30분 간격으로 현재가를 조회해 매입가 대비 threshold 도달 시 알람 생성.

    - KR: 09:00~15:30 KST
    - US: 09:30~16:00 EST (한국 시간 23:30~익일 06:00)

    스케줄: 30분마다
    """
    stocks = db.query(Portfolio).all()
    created: list[Alert] = []

    for stock in stocks:
        if not _is_market_open(stock.market):
            continue

        try:
            data = get_stock(stock.ticker, stock.market)
            current_price = data["current_price"]
        except Exception:
            continue

        change_pct = (
            (current_price - stock.buy_price) / stock.buy_price * 100
            if stock.buy_price else 0.0
        )

        # 임계값 도달 여부
        if change_pct > stock.alert_threshold:
            continue  # 아직 임계값 미달

        # 30분 이내 동일 종목 시세 알람 중복 방지
        cutoff = (datetime.now() - timedelta(minutes=30)).isoformat()
        already = db.query(Alert).filter(
            Alert.stock_id == stock.id,
            Alert.alert_type == "PRICE_REACHED",
            Alert.triggered_at >= cutoff,
        ).first()
        if already:
            continue

        direction = "▼ 하락" if change_pct < 0 else "▲ 상승"
        msg = (
            f"[시세 알람] {stock.name}({stock.ticker}) "
            f"현재가 {current_price:,.0f} | {direction} {change_pct:+.2f}% "
            f"(임계값 {stock.alert_threshold:+.1f}%)"
        )
        alert = Alert(
            stock_id=stock.id,
            alert_type="PRICE_REACHED",
            message=msg,
            triggered_at=datetime.now().isoformat(),
            is_sent=0,
        )
        db.add(alert)
        created.append(alert)

    if created:
        db.commit()

    return created


def get_pending_alerts(db: Session) -> list[Alert]:
    """미발송(is_sent=0) 알람 목록 반환"""
    return db.query(Alert).filter(Alert.is_sent == 0).order_by(Alert.triggered_at).all()


def mark_sent(alert_ids: list[int], db: Session) -> None:
    """알람 발송 완료 처리 (is_sent=1)"""
    db.query(Alert).filter(Alert.id.in_(alert_ids)).update(
        {"is_sent": 1}, synchronize_session=False
    )
    db.commit()


# ────────────────────────────────────────────
# 내부 헬퍼
# ────────────────────────────────────────────

def _is_market_open(market: str) -> bool:
    """현재 시각이 해당 시장 거래 시간인지 확인"""
    now_kst = datetime.now(KST)
    now_est = datetime.now(EST)

    if market == "KR":
        # KRX: 평일 09:00~15:30
        if now_kst.weekday() >= 5:
            return False
        open_t = now_kst.replace(hour=9, minute=0, second=0, microsecond=0)
        close_t = now_kst.replace(hour=15, minute=30, second=0, microsecond=0)
        return open_t <= now_kst <= close_t

    if market == "US":
        # NYSE/NASDAQ: 평일 09:30~16:00 EST
        if now_est.weekday() >= 5:
            return False
        open_t = now_est.replace(hour=9, minute=30, second=0, microsecond=0)
        close_t = now_est.replace(hour=16, minute=0, second=0, microsecond=0)
        return open_t <= now_est <= close_t

    return False
