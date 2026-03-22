"""
RSI (Relative Strength Index) 계산 서비스

기준:
- 기간: 14일 (표준)
- 방식: Wilder's Smoothing (EMA 변형) — yfinance / TradingView 기준과 동일
- 과매도: RSI ≤ 30
- 과매수: RSI ≥ 70

최소 데이터 요건: 15개 이상의 종가 필요 (14일 변화량 + 1)
"""


def calculate_rsi(closes: list[float], period: int = 14) -> float | None:
    """
    종가 리스트로 RSI 계산 (Wilder's Smoothing)

    Args:
        closes: 날짜 오름차순 종가 리스트
        period: RSI 기간 (기본 14)

    Returns:
        RSI 값 (0.0 ~ 100.0), 데이터 부족 시 None
    """
    if len(closes) < period + 1:
        return None

    # 일별 변화량
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]

    # 첫 번째 평균: 단순 평균 (SMA seed)
    gains = [d if d > 0 else 0.0 for d in deltas[:period]]
    losses = [abs(d) if d < 0 else 0.0 for d in deltas[:period]]

    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period

    # 이후: Wilder's Smoothing (EMA 방식)
    for delta in deltas[period:]:
        gain = delta if delta > 0 else 0.0
        loss = abs(delta) if delta < 0 else 0.0
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period

    if avg_loss == 0:
        return 100.0

    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 2)


def get_rsi_signal(rsi: float | None) -> str:
    """RSI 값으로 신호 문자열 반환"""
    if rsi is None:
        return "UNKNOWN"
    if rsi <= 30:
        return "OVERSOLD"   # 과매도 — 매수 신호 참고
    if rsi >= 70:
        return "OVERBOUGHT"  # 과매수 — 매도 신호 참고
    return "NEUTRAL"


def calculate_rsi_from_history(history: list[dict], period: int = 14) -> float | None:
    """
    stock_service 의 history 리스트로 RSI 계산

    Args:
        history: [{"date": ..., "close": ...}, ...] 날짜 오름차순
        period:  RSI 기간

    Returns:
        RSI 값 또는 None
    """
    closes = [item["close"] for item in history]
    return calculate_rsi(closes, period)
