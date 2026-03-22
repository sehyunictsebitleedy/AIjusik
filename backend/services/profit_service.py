"""
손익 계산 서비스

계산 항목:
- 평가금액      = 현재가 × 수량
- 매입금액      = 매입가 × 수량
- 평가손익      = 평가금액 - 매입금액
- 수익률(%)     = (현재가 - 매입가) / 매입가 × 100
"""
from dataclasses import dataclass


@dataclass
class ProfitResult:
    ticker: str
    market: str
    current_price: float
    buy_price: float
    quantity: int
    current_value: float    # 평가금액
    buy_value: float        # 매입금액
    profit_loss: float      # 평가손익
    return_pct: float       # 수익률 (%)
    change_pct: float       # 당일 등락률 (%)


def calc_profit(
    buy_price: float,
    quantity: int,
    current_price: float,
    change_pct: float = 0.0,
    ticker: str = "",
    market: str = "",
) -> ProfitResult:
    """
    단일 종목 손익 계산

    Args:
        buy_price:     매입 평균가
        quantity:      보유 수량
        current_price: 현재가
        change_pct:    당일 등락률 (stock_service 에서 제공)
        ticker:        티커 (결과 식별용)
        market:        'KR' | 'US'

    Returns:
        ProfitResult
    """
    buy_value = buy_price * quantity
    current_value = current_price * quantity
    profit_loss = current_value - buy_value
    return_pct = ((current_price - buy_price) / buy_price * 100) if buy_price else 0.0

    return ProfitResult(
        ticker=ticker,
        market=market,
        current_price=round(current_price, 4),
        buy_price=round(buy_price, 4),
        quantity=quantity,
        current_value=round(current_value, 2),
        buy_value=round(buy_value, 2),
        profit_loss=round(profit_loss, 2),
        return_pct=round(return_pct, 2),
        change_pct=round(change_pct, 2),
    )
