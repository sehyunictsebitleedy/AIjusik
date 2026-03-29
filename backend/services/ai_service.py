"""
Claude API 호출 서비스

기능:
1. analyze_stock()     — 종목별 AI 전망 (SELL/HOLD/BUY + 근거)
2. generate_briefing() — 전체 보유 종목 브리핑 요약
3. recommend_stocks()  — 당일 뉴스 기반 추천 5종목

공통:
- 모델: claude-sonnet-4-20250514
- 응답: JSON 파싱, 실패 시 예외 대신 fallback dict 반환
"""
import json
import os
import re

import anthropic

MODEL = "claude-sonnet-4-5"
_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.")
        _client = anthropic.Anthropic(api_key=api_key)
    return _client


# ────────────────────────────────────────────
# 1. 종목별 AI 전망
# ────────────────────────────────────────────

def analyze_stock(
    ticker: str,
    name: str,
    market: str,
    buy_price: float,
    current_price: float,
    rsi: float | None,
    news_summaries: list[str],
) -> dict:
    """
    단일 종목 AI 분석.

    Returns:
        {
            "signal": "HOLD",           # BUY | HOLD | SELL
            "predicted_change_pct": -3.5,
            "reason": "...",
            "risk_level": "MEDIUM"      # LOW | MEDIUM | HIGH
        }
    """
    rsi_text = f"{rsi:.1f}" if rsi is not None else "데이터 없음"
    news_text = "\n".join(f"- {s}" for s in news_summaries[:10]) or "관련 뉴스 없음"
    return_pct = ((current_price - buy_price) / buy_price * 100) if buy_price else 0

    prompt = f"""다음 보유 종목이 최근 뉴스로 인해 위험한지, 안전한지, 추가 매수할만한지 판단해주세요.

## 종목 정보
- 티커: {ticker} ({market})
- 종목명: {name}
- 매입가: {buy_price:,.2f}
- RSI(14): {rsi_text}

## 오늘의 관련 뉴스
{news_text}

## 판단 기준
- SELL: 뉴스가 이 종목에 심각한 부정적 영향을 줄 가능성이 높음 → 매도 고려
- HOLD: 변동성은 있으나 큰 위험 없음 → 현 상태 유지
- BUY: 뉴스가 긍정적이며 추가 매수 기회로 볼 수 있음

## 요청
뉴스가 이 종목에 미칠 영향을 분석하고 아래 JSON 형식으로만 응답하세요.
다른 텍스트 없이 JSON만 반환하세요.

{{
  "signal": "HOLD",
  "predicted_change_pct": -3.5,
  "reason": "뉴스 기반 판단 근거 2~3문장. 왜 위험한지 또는 왜 안전한지 명확하게.",
  "risk_level": "MEDIUM",
  "volatility": "뉴스로 인한 예상 변동성 한 줄 요약",
  "sell_target": {{
    "price": 75000,
    "reason": "이 가격에서 매도를 고려해야 하는 이유",
    "horizon": "1~2주 내"
  }},
  "key_factors": ["핵심 요인 1", "핵심 요인 2", "핵심 요인 3"]
}}

signal: BUY(추가매수 추천) | HOLD(보유유지) | SELL(위험/매도고려)
predicted_change_pct: 뉴스 영향으로 인한 예측 등락률 (%)
risk_level: LOW(안전) | MEDIUM(주의) | HIGH(위험)
volatility: 변동성 요약 한 줄
sell_target.price: 매도 고려 목표가 (현재가 기준 계산, 숫자만)
sell_target.reason: 해당 가격에서 매도를 고려해야 하는 이유
sell_target.horizon: 예상 달성 기간
key_factors: 주가에 영향을 줄 핵심 요인 3가지 (뉴스 기반)"""

    try:
        client = _get_client()
        message = client.messages.create(
            model=MODEL,
            max_tokens=512,
            system=(
                "당신은 주식 투자 분석 AI입니다. "
                "사용자의 보유 종목과 오늘의 뉴스를 바탕으로 "
                "투자 판단에 도움이 되는 간결하고 정확한 분석을 제공합니다. "
                "투자 권유가 아닌 정보 제공 목적임을 항상 전제합니다."
            ),
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text
        return _parse_json(raw, _default_analysis())
    except Exception as e:
        result = _default_analysis()
        result["reason"] = f"AI 분석 실패: {e}"
        return result


# ────────────────────────────────────────────
# 2. 전체 브리핑 요약
# ────────────────────────────────────────────

def generate_briefing(
    portfolio_summaries: list[dict],  # analyze_stock 결과 + ticker/name 포함
    market_news_summaries: list[str],
) -> str:
    """
    전체 시장 분위기 한줄 + 보유 종목 브리핑 요약 텍스트 생성.

    Args:
        portfolio_summaries: [{"ticker", "name", "signal", "reason", ...}, ...]
        market_news_summaries: 오늘 전체 뉴스 제목 리스트

    Returns:
        브리핑 전체 텍스트 (마크다운)
    """
    stocks_text = "\n".join(
        f"- {s['name']}({s['ticker']}): {s.get('signal','?')} — {s.get('reason','')}"
        for s in portfolio_summaries
    )
    news_text = "\n".join(f"- {n}" for n in market_news_summaries[:15]) or "오늘 뉴스 없음"

    prompt = f"""오늘의 시장 상황과 보유 종목 분석 결과를 바탕으로 아침 투자 브리핑을 작성해주세요.

## 보유 종목 분석 결과
{stocks_text}

## 오늘의 주요 뉴스 헤드라인
{news_text}

## 요청
1. 전체 시장 분위기 한줄 요약 (시작: "📊 오늘의 시장:")
2. 보유 종목별 핵심 요점 (간결하게)
3. 오늘 주의할 점 한줄

3개 항목을 구분해서 간결하게 작성해주세요. 전체 300자 이내."""

    try:
        client = _get_client()
        message = client.messages.create(
            model=MODEL,
            max_tokens=512,
            system=(
                "당신은 개인 투자자를 위한 아침 브리핑 AI입니다. "
                "핵심만 간결하게 전달하며 투자 권유가 아닌 정보 제공임을 전제합니다."
            ),
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text
    except Exception as e:
        return f"브리핑 생성 실패: {e}"


# ────────────────────────────────────────────
# 3. 추천 5종목
# ────────────────────────────────────────────

def recommend_stocks(news_summaries: list[str], market: str = "ALL") -> list[dict]:
    """
    당일 뉴스 기반 추천 5종목 생성.

    Args:
        news_summaries: 오늘 수집된 뉴스 제목 리스트
        market: "KR" | "US" | "ALL"

    Returns:
        [
            {
                "ticker": "NVDA",
                "name": "NVIDIA Corporation",
                "market": "US",
                "reason": "추천 이유",
                "direction": "UP"   # UP | DOWN
            },
            ...
        ]
    """
    market_guide = {
        "KR": "한국 주식(KRX)만",
        "US": "미국 주식(NYSE/NASDAQ)만",
        "ALL": "한국 주식 2~3종목, 미국 주식 2~3종목 혼합으로",
    }.get(market, "한국/미국 혼합으로")

    news_text = "\n".join(f"- {n}" for n in news_summaries[:20]) or "오늘 뉴스 없음"

    prompt = f"""오늘의 뉴스를 분석해 {market_guide} 주목할 종목 5개를 추천해주세요.

## 오늘의 주요 뉴스
{news_text}

## 요청
뉴스에서 긍정적 또는 부정적 영향을 받을 종목을 분석하고,
아래 JSON 배열 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 반환하세요.

[
  {{
    "ticker": "NVDA",
    "name": "NVIDIA Corporation",
    "market": "US",
    "reason": "추천 이유 1~2문장",
    "direction": "UP"
  }}
]

direction: UP(상승 기대) | DOWN(하락 주의)
반드시 5개 종목을 반환하세요."""

    try:
        client = _get_client()
        message = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=(
                "당신은 뉴스 기반 주식 분석 AI입니다. "
                "오늘의 뉴스에서 주목할 종목을 찾아 간결하게 제시합니다. "
                "투자 권유가 아닌 정보 제공 목적입니다."
            ),
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text
        data = _parse_json(raw, [])
        if isinstance(data, list):
            return data[:5]
        return []
    except Exception as e:
        return [{"ticker": "N/A", "name": "추천 생성 실패", "market": "-", "reason": str(e), "direction": "UP"}]


# ────────────────────────────────────────────
# 내부 헬퍼
# ────────────────────────────────────────────

def _parse_json(text: str, fallback):
    """응답 텍스트에서 JSON 추출 및 파싱. 실패 시 fallback 반환."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # 마크다운 코드블록 안에 있을 경우 추출
        match = re.search(r"```(?:json)?\s*([\s\S]+?)```", text)
        if match:
            try:
                return json.loads(match.group(1).strip())
            except json.JSONDecodeError:
                pass
        return fallback


def _default_analysis() -> dict:
    return {
        "signal": "HOLD",
        "predicted_change_pct": 0.0,
        "reason": "분석 데이터를 불러오지 못했습니다.",
        "risk_level": "MEDIUM",
    }
