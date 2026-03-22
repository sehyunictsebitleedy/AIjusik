"""
알람 API

GET  /alerts                  — 알람 이력 전체 (최신순)
GET  /alerts/pending          — 미발송 알람 목록
POST /alerts/register-token   — Expo 푸시 토큰 등록
POST /alerts/send-pending     — 미발송 알람 전체 푸시 발송
POST /alerts/check/price      — 시세 알람 수동 트리거 (테스트용)
POST /alerts/check/ai         — AI 예측 알람 수동 트리거 (테스트용)
DELETE /alerts/{alert_id}     — 알람 삭제
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Alert, Portfolio
from backend.services.alert_service import (
    check_ai_prediction_alerts,
    check_price_alerts,
    get_pending_alerts,
)
from backend.services.push_service import (
    get_token,
    save_token,
    send_pending_alerts,
)

router = APIRouter()


class AlertResponse(BaseModel):
    id: int
    stock_id: int
    ticker: str | None
    name: str | None
    alert_type: str | None
    message: str | None
    triggered_at: str
    is_sent: int


class TriggerResult(BaseModel):
    triggered: int
    pushed: int
    alerts: list[AlertResponse]


class TokenRegister(BaseModel):
    token: str   # ExponentPushToken[...]


class TokenResponse(BaseModel):
    token: str | None
    registered: bool


class SendResult(BaseModel):
    sent: int
    failed: int


# ────────────────────────────────────────────
# 엔드포인트
# ────────────────────────────────────────────

@router.post("/register-token", response_model=TokenResponse)
def register_push_token(body: TokenRegister, db: Session = Depends(get_db)):
    """앱에서 발급된 Expo 푸시 토큰을 백엔드에 저장"""
    if not body.token.startswith("ExponentPushToken"):
        raise HTTPException(status_code=400, detail="유효하지 않은 Expo 토큰 형식입니다.")
    save_token(body.token, db)
    return TokenResponse(token=body.token, registered=True)


@router.get("/push-token", response_model=TokenResponse)
def get_push_token(db: Session = Depends(get_db)):
    """현재 등록된 푸시 토큰 조회"""
    token = get_token(db)
    return TokenResponse(token=token, registered=token is not None)


@router.post("/send-pending", response_model=SendResult)
def send_pending(db: Session = Depends(get_db)):
    """미발송 알람 전체를 Expo Push로 발송"""
    result = send_pending_alerts(db)
    return SendResult(**result)


@router.get("", response_model=list[AlertResponse])
def list_alerts(limit: int = 50, db: Session = Depends(get_db)):
    """알람 이력 전체 (최신순, 기본 50건)"""
    rows = (
        db.query(Alert)
        .order_by(Alert.triggered_at.desc())
        .limit(limit)
        .all()
    )
    return [_to_response(r, db) for r in rows]


@router.get("/pending", response_model=list[AlertResponse])
def list_pending_alerts(db: Session = Depends(get_db)):
    """미발송(is_sent=0) 알람 목록"""
    rows = get_pending_alerts(db)
    return [_to_response(r, db) for r in rows]


@router.post("/check/price", response_model=TriggerResult)
def trigger_price_check(db: Session = Depends(get_db)):
    """시세 알람 수동 트리거 + 즉시 푸시 발송"""
    created = check_price_alerts(db)
    pushed = 0
    for alert in created:
        from backend.services.push_service import send_alert_push
        if send_alert_push(alert, db):
            pushed += 1
    return TriggerResult(
        triggered=len(created),
        pushed=pushed,
        alerts=[_to_response(a, db) for a in created],
    )


@router.post("/check/ai", response_model=TriggerResult)
def trigger_ai_check(db: Session = Depends(get_db)):
    """AI 예측 알람 수동 트리거 + 즉시 푸시 발송"""
    created = check_ai_prediction_alerts(db)
    pushed = 0
    for alert in created:
        from backend.services.push_service import send_alert_push
        if send_alert_push(alert, db):
            pushed += 1
    return TriggerResult(
        triggered=len(created),
        pushed=pushed,
        alerts=[_to_response(a, db) for a in created],
    )


@router.delete("/{alert_id}", status_code=204)
def delete_alert(alert_id: int, db: Session = Depends(get_db)):
    """알람 삭제"""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="알람을 찾을 수 없습니다.")
    db.delete(alert)
    db.commit()


# ────────────────────────────────────────────
# 내부 헬퍼
# ────────────────────────────────────────────

def _to_response(alert: Alert, db: Session) -> AlertResponse:
    stock = db.query(Portfolio).filter(Portfolio.id == alert.stock_id).first()
    return AlertResponse(
        id=alert.id,
        stock_id=alert.stock_id,
        ticker=stock.ticker if stock else None,
        name=stock.name if stock else None,
        alert_type=alert.alert_type,
        message=alert.message,
        triggered_at=alert.triggered_at,
        is_sent=alert.is_sent,
    )
