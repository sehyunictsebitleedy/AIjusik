"""
Expo Push Notification 발송 서비스

Expo Push API (무료, 인증 불필요):
  POST https://exp.host/--/api/v2/push/send
  Content-Type: application/json
  Body: { "to": "ExponentPushToken[...]", "title": "...", "body": "...", "data": {...} }

응답:
  { "data": [{ "status": "ok", "id": "..." }] }
  또는
  { "data": [{ "status": "error", "message": "...", "details": {...} }] }
"""
import logging

import httpx
from sqlalchemy.orm import Session

from backend.models import Alert, PushToken

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

logger = logging.getLogger(__name__)


# ────────────────────────────────────────────
# 토큰 관리
# ────────────────────────────────────────────

def save_token(token: str, db: Session) -> None:
    """Expo 푸시 토큰 저장 (단일 사용자 — upsert)"""
    from datetime import datetime
    row = db.query(PushToken).filter(PushToken.id == 1).first()
    if row:
        row.token = token
        row.updated_at = datetime.now().isoformat()
    else:
        db.add(PushToken(id=1, token=token))
    db.commit()


def get_token(db: Session) -> str | None:
    """저장된 Expo 푸시 토큰 반환"""
    row = db.query(PushToken).filter(PushToken.id == 1).first()
    return row.token if row else None


# ────────────────────────────────────────────
# 푸시 발송
# ────────────────────────────────────────────

def send_push(
    token: str,
    title: str,
    body: str,
    data: dict | None = None,
) -> bool:
    """
    단건 Expo 푸시 발송.

    Returns:
        True if 발송 성공, False otherwise
    """
    payload = {
        "to": token,
        "title": title,
        "body": body,
        "sound": "default",
        "priority": "high",
        "data": data or {},
    }

    try:
        res = httpx.post(
            EXPO_PUSH_URL,
            json=payload,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=10.0,
        )
        res.raise_for_status()
        result = res.json()
        ticket = result.get("data", [{}])[0]
        if ticket.get("status") == "ok":
            logger.info(f"[push] 발송 성공: {ticket.get('id')}")
            return True
        else:
            logger.warning(f"[push] 발송 실패: {ticket.get('message')}")
            return False
    except Exception as e:
        logger.error(f"[push] 발송 오류: {e}")
        return False


def send_alert_push(alert: Alert, db: Session) -> bool:
    """
    Alert 레코드를 기반으로 푸시 발송 후 is_sent=1 처리.

    alert_type별 제목:
      AI_PREDICTION  → 📉 AI 경보
      PRICE_REACHED  → ⚡ 시세 알람
    """
    token = get_token(db)
    if not token:
        logger.warning("[push] 등록된 푸시 토큰 없음 — 발송 생략")
        return False

    title_map = {
        "AI_PREDICTION": "📉 AI 경보",
        "PRICE_REACHED": "⚡ 시세 알람",
    }
    title = title_map.get(alert.alert_type or "", "🔔 알람")
    body = alert.message or ""

    success = send_push(
        token=token,
        title=title,
        body=body,
        data={"alert_id": alert.id, "stock_id": alert.stock_id, "type": alert.alert_type},
    )

    if success:
        alert.is_sent = 1
        db.commit()

    return success


def send_pending_alerts(db: Session) -> dict[str, int]:
    """
    미발송(is_sent=0) 알람 전체를 푸시 발송.
    스케줄러 또는 수동 트리거에서 호출.

    Returns:
        {"sent": n, "failed": n}
    """
    token = get_token(db)
    if not token:
        return {"sent": 0, "failed": 0}

    pending = db.query(Alert).filter(Alert.is_sent == 0).all()
    sent = failed = 0

    for alert in pending:
        ok = send_alert_push(alert, db)
        if ok:
            sent += 1
        else:
            failed += 1

    logger.info(f"[push] 미발송 처리 완료: 성공 {sent}건 / 실패 {failed}건")
    return {"sent": sent, "failed": failed}
