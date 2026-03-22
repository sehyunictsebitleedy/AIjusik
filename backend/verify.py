"""
백엔드 연결 및 의존성 검증 스크립트

실행 방법 (backend/ 상위 디렉토리에서):
  python -m backend.verify

항목:
  1. 환경변수 확인 (.env)
  2. DB 초기화 + 테이블 생성 확인
  3. yfinance 미국 주식 조회 테스트 (AAPL)
  4. pykrx 한국 주식 조회 테스트 (005930)
  5. Claude API 연결 테스트
  6. NewsAPI 연결 테스트 (키 있을 때만)
"""
import os
import sys

from dotenv import load_dotenv

load_dotenv()

OK = "✅"
FAIL = "❌"
SKIP = "⏭️ "

results: list[tuple[str, bool, str]] = []


def check(label: str, fn):
    try:
        msg = fn()
        results.append((label, True, msg or "OK"))
        print(f"  {OK} {label}: {msg or 'OK'}")
    except Exception as e:
        results.append((label, False, str(e)))
        print(f"  {FAIL} {label}: {e}")


# ────────────────────────────────────────────
# 1. 환경변수
# ────────────────────────────────────────────
print("\n[1] 환경변수 확인")

def check_env():
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    news_key = os.getenv("NEWS_API_KEY", "")
    tz = os.getenv("SCHEDULER_TIMEZONE", "Asia/Seoul")
    parts = []
    if anthropic_key and anthropic_key != "your_key_here":
        parts.append("ANTHROPIC_API_KEY ✓")
    else:
        parts.append("ANTHROPIC_API_KEY 미설정 ⚠")
    if news_key and news_key != "your_key_here":
        parts.append("NEWS_API_KEY ✓")
    else:
        parts.append("NEWS_API_KEY 미설정 (선택)")
    parts.append(f"TIMEZONE={tz}")
    return " | ".join(parts)

check("환경변수", check_env)

# ────────────────────────────────────────────
# 2. DB 초기화
# ────────────────────────────────────────────
print("\n[2] DB 초기화")

def check_db():
    from backend.database import init_db, engine
    init_db()
    from sqlalchemy import inspect
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    expected = {"portfolio", "news_cache", "ai_analysis", "alerts", "push_tokens"}
    missing = expected - set(tables)
    if missing:
        raise RuntimeError(f"누락된 테이블: {missing}")
    return f"테이블 {len(tables)}개 확인: {', '.join(sorted(tables))}"

check("SQLite DB + 테이블", check_db)

# ────────────────────────────────────────────
# 3. yfinance — 미국 주식
# ────────────────────────────────────────────
print("\n[3] yfinance (미국 주식)")

def check_yfinance():
    from backend.services.stock_service import get_us_stock
    data = get_us_stock("AAPL")
    price = data["current_price"]
    hist_len = len(data["history"])
    return f"AAPL 현재가 ${price:.2f} | 히스토리 {hist_len}일"

check("yfinance AAPL", check_yfinance)

# ────────────────────────────────────────────
# 4. pykrx — 한국 주식
# ────────────────────────────────────────────
print("\n[4] pykrx (한국 주식)")

def check_pykrx():
    from backend.services.stock_service import get_kr_stock
    data = get_kr_stock("005930")
    price = data["current_price"]
    hist_len = len(data["history"])
    return f"삼성전자 현재가 {int(price):,}원 | 히스토리 {hist_len}일"

check("pykrx 005930 (삼성전자)", check_pykrx)

# ────────────────────────────────────────────
# 5. RSI 계산
# ────────────────────────────────────────────
print("\n[5] RSI 계산")

def check_rsi():
    from backend.services.stock_service import get_us_stock
    from backend.services.rsi_service import calculate_rsi_from_history
    data = get_us_stock("AAPL")
    rsi = calculate_rsi_from_history(data["history"])
    if rsi is None:
        raise RuntimeError("RSI 계산 실패 (데이터 부족)")
    signal = "과매도" if rsi <= 30 else "과매수" if rsi >= 70 else "중립"
    return f"AAPL RSI={rsi} ({signal})"

check("RSI(14) 계산", check_rsi)

# ────────────────────────────────────────────
# 6. Claude API
# ────────────────────────────────────────────
print("\n[6] Claude API")

def check_claude():
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key or api_key == "your_key_here":
        return f"{SKIP} ANTHROPIC_API_KEY 미설정 — 건너뜀"
    import anthropic
    client = anthropic.Anthropic(api_key=api_key)
    msg = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=32,
        messages=[{"role": "user", "content": "숫자 1만 응답하세요."}],
    )
    resp = msg.content[0].text.strip()
    return f"응답: '{resp}' | 입력 {msg.usage.input_tokens}tok / 출력 {msg.usage.output_tokens}tok"

check("Claude API 연결", check_claude)

# ────────────────────────────────────────────
# 7. NewsAPI (선택)
# ────────────────────────────────────────────
print("\n[7] NewsAPI (선택)")

def check_newsapi():
    api_key = os.getenv("NEWS_API_KEY", "")
    if not api_key or api_key == "your_key_here":
        return f"{SKIP} NEWS_API_KEY 미설정 — 건너뜀"
    from newsapi import NewsApiClient
    client = NewsApiClient(api_key=api_key)
    res = client.get_everything(q="Apple", language="en", page_size=1)
    total = res.get("totalResults", 0)
    return f"Apple 뉴스 {total}건 조회 가능"

check("NewsAPI 연결", check_newsapi)

# ────────────────────────────────────────────
# 결과 요약
# ────────────────────────────────────────────
print("\n" + "=" * 50)
passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"결과: {passed}/{total} 통과")
if passed < total:
    print("\n실패 항목:")
    for label, ok, msg in results:
        if not ok:
            print(f"  {FAIL} {label}: {msg}")
else:
    print("모든 항목 통과 — 서버를 시작할 준비가 됐습니다! 🚀")
print()
