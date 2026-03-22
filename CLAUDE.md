# 📈 AI 개인 투자 어시스턴트 — CLAUDE.md

## 프로젝트 개요

> **"내 주식을 매일 아침 AI가 브리핑해주는 개인 투자 어시스턴트"**

개인 사용자 1인을 위한 모바일 앱. 국내/미국 주식 보유 종목의 뉴스 영향 분석, AI 매도/보유 전망,
RSI 기반 차트 분석, 하락 경보 알람 기능을 제공한다.

---

## 기술 스택

| 영역 | 기술 | 비고 |
|---|---|---|
| 모바일 앱 | React Native (Expo) | iOS/Android 동시 지원 |
| 백엔드 | FastAPI (Python 3.11+) | AI/데이터 처리 |
| AI 엔진 | Claude API (claude-sonnet-4-20250514) | 뉴스 분석, 투자 전망 |
| 주식 데이터 (미국) | yfinance | 무료, 안정적 |
| 주식 데이터 (한국) | pykrx | KRX 공식 데이터 |
| 뉴스 수집 | NewsAPI + RSS (네이버 금융, Yahoo Finance) | 국내외 금융 뉴스 |
| 스케줄러 | APScheduler | 정기 분석 및 알람 트리거 |
| 푸시 알람 | Expo Push Notifications | 앱 종료 상태에서도 수신 |
| DB | SQLite (로컬) | 개인용, 경량 |
| 차트 | Victory Native | RSI 등 기술 지표 커스텀 |

---

## 프로젝트 구조

```
project-root/
├── backend/                    # FastAPI 서버
│   ├── main.py                 # 앱 진입점
│   ├── routers/
│   │   ├── stocks.py           # 주식 데이터 API
│   │   ├── portfolio.py        # 보유 종목 CRUD
│   │   ├── briefing.py         # AI 브리핑 API
│   │   ├── recommend.py        # 추천 5종목 API
│   │   └── alerts.py           # 알람 설정 API
│   ├── services/
│   │   ├── stock_service.py    # yfinance / pykrx 연동
│   │   ├── news_service.py     # 뉴스 수집
│   │   ├── ai_service.py       # Claude API 호출
│   │   ├── rsi_service.py      # RSI 계산 로직
│   │   └── alert_service.py    # 알람 트리거 로직
│   ├── scheduler.py            # APScheduler 작업 정의
│   ├── models.py               # DB 모델 (SQLAlchemy)
│   ├── database.py             # SQLite 연결
│   └── requirements.txt
│
└── mobile/                     # React Native (Expo)
    ├── app/
    │   ├── (tabs)/
    │   │   ├── briefing.tsx    # 탭1: 오늘의 브리핑
    │   │   ├── portfolio.tsx   # 탭2: 내 주식
    │   │   ├── recommend.tsx   # 탭3: 추천 5종목
    │   │   └── settings.tsx    # 탭4: 설정
    │   └── stock/[ticker].tsx  # 종목 상세 (차트+RSI+AI전망)
    ├── components/
    │   ├── StockCard.tsx
    │   ├── RSIChart.tsx
    │   ├── CandleChart.tsx
    │   ├── AlertBadge.tsx
    │   └── BriefingItem.tsx
    ├── services/
    │   └── api.ts              # 백엔드 API 호출
    └── package.json
```

---

## 데이터 모델 (SQLite)

### portfolio (보유 종목)
```sql
id          INTEGER PRIMARY KEY
ticker      TEXT NOT NULL          -- 예: '005930', 'AAPL'
name        TEXT NOT NULL          -- 예: '삼성전자', 'Apple Inc.'
market      TEXT NOT NULL          -- 'KR' | 'US'
buy_price   REAL NOT NULL          -- 매입 평균가
quantity    INTEGER NOT NULL       -- 보유 수량
buy_date    TEXT                   -- 매입일 (YYYY-MM-DD)
alert_threshold REAL DEFAULT -10.0 -- 알람 임계값 (%)
created_at  TEXT
```

### news_cache (뉴스 캐시)
```sql
id              INTEGER PRIMARY KEY
title           TEXT
summary         TEXT
url             TEXT
published_at    TEXT
related_tickers TEXT    -- JSON array: '["AAPL","TSLA"]'
source          TEXT
fetched_at      TEXT
```

### ai_analysis (AI 분석 결과)
```sql
id          INTEGER PRIMARY KEY
stock_id    INTEGER REFERENCES portfolio(id)
date        TEXT
signal      TEXT    -- 'BUY' | 'HOLD' | 'SELL'
reason      TEXT
rsi_value   REAL
predicted_change_pct REAL    -- AI 예측 등락률
raw_response TEXT
created_at  TEXT
```

### alerts (알람 이력)
```sql
id          INTEGER PRIMARY KEY
stock_id    INTEGER REFERENCES portfolio(id)
alert_type  TEXT    -- 'AI_PREDICTION' | 'PRICE_REACHED'
message     TEXT
triggered_at TEXT
is_sent     INTEGER DEFAULT 0
```

---

## 핵심 기능 명세

### 1. 오늘의 브리핑 (탭1)
- 매일 오전 8시 자동 실행 (APScheduler)
- 뉴스 수집 → 보유 종목별 관련 뉴스 필터링
- Claude API로 종목별 영향도 분석 및 한줄 요약 생성
- 전체 시장 분위기 한줄 요약

### 2. 내 주식 (탭2)
- 종목 추가: 티커 + 매입가 + 수량 입력
- 현재가 / 평가금액 / 평가손익 / 수익률 표시
- 종목 상세 진입 시:
  - 캔들 차트 (일/주/월 전환)
  - RSI 차트 (기준선 30 과매도 / 70 과매수 표시)
  - AI 전망: SELL / HOLD / BUY 신호 + 근거 텍스트

### 3. 추천 5종목 (탭3)
- 당일 뉴스 기반 Claude API가 국내/미국 각각 분석
- 추천 종목명, 티커, 추천 이유, 기대 방향(▲/▼) 표시
- 매일 브리핑 생성 시 함께 갱신

### 4. 알람 기능
- **AI 예측 알람**: AI 분석에서 예측 하락률이 임계값(-10% 기본) 초과 시 Expo Push 발송
- **실시간 시세 알람**: 장 중 30분 간격 체크, 현재가가 매입가 대비 임계값 도달 시 발송
- 종목별 임계값 개별 설정 가능 (설정 탭)

### 5. RSI 계산 기준
- 기간: 14일 (표준)
- 과매도 기준: RSI ≤ 30 → 매수 신호 참고
- 과매수 기준: RSI ≥ 70 → 매도 신호 참고
- AI 전망 프롬프트에 RSI 값 포함하여 분석에 반영

---

## Claude API 사용 지침

### 모델
```
claude-sonnet-4-20250514
```

### 브리핑 분석 프롬프트 구조
```
시스템: 당신은 주식 투자 분석 AI입니다. 사용자의 보유 종목과 오늘의 뉴스를 바탕으로
       투자 판단에 도움이 되는 간결하고 정확한 분석을 제공합니다.
       투자 권유가 아닌 정보 제공 목적임을 항상 전제합니다.

사용자 입력:
- 보유 종목 목록 (티커, 매입가, 수량, 현재 RSI)
- 오늘 수집된 뉴스 요약 목록
- 요청: 종목별 영향도 분석 + 매도/보유 신호
```

### AI 전망 응답 형식 (JSON)
```json
{
  "signal": "HOLD",
  "predicted_change_pct": -3.5,
  "reason": "반도체 수출 규제 뉴스로 단기 하락 압력 예상. RSI 45로 중립 구간.",
  "risk_level": "MEDIUM"
}
```

---

## 스케줄러 작업 정의

| 작업 | 주기 | 설명 |
|---|---|---|
| `fetch_news` | 매일 07:30 | 뉴스 수집 및 캐시 저장 |
| `run_briefing` | 매일 08:00 | AI 브리핑 생성 + 추천 5종목 |
| `check_price_alert` | 장 중 30분마다 (09:00~15:30 KST / 09:30~16:00 EST) | 실시간 시세 알람 체크 |
| `run_ai_prediction_alert` | 매일 08:05 | AI 예측 기반 알람 발송 |

---

## 개발 순서 (단계별)

| 단계 | 내용 |
|---|---|
| **1단계** | 백엔드 FastAPI 프로젝트 셋업 + yfinance/pykrx 데이터 연동 |
| **2단계** | DB 모델 생성 + 보유 종목 CRUD API |
| **3단계** | 손익 계산 + RSI 계산 서비스 구현 |
| **4단계** | 뉴스 수집 서비스 + Claude API 브리핑 연동 |
| **5단계** | 알람 서비스 + APScheduler 스케줄러 |
| **6단계** | Expo 프로젝트 셋업 + 탭 구조 + API 연동 |
| **7단계** | 차트 (캔들 + RSI) 화면 구현 |
| **8단계** | 푸시 알람 (Expo Push) 연동 |
| **9단계** | UI 다듬기 + 테스트 |

---

## 환경 변수 (.env)

```env
# Claude API
ANTHROPIC_API_KEY=your_key_here

# NewsAPI
NEWS_API_KEY=your_key_here

# 앱 설정
ALERT_DEFAULT_THRESHOLD=-10.0
SCHEDULER_TIMEZONE=Asia/Seoul
```

---

## 주의사항

- 이 앱은 **투자 권유 서비스가 아님** — AI 분석은 참고 정보 제공 목적
- yfinance는 실시간 데이터가 아닌 15분 지연 데이터 사용
- pykrx는 당일 장 마감 후 종가 데이터 기준
- Claude API 응답은 항상 JSON 파싱 예외 처리 필수
- SQLite는 단일 사용자 전제, 동시 접근 이슈 없음
