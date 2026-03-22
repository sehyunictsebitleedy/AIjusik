# 📈 AI 개인 투자 어시스턴트

> 내 주식을 매일 아침 AI가 브리핑해주는 개인용 모바일 앱

국내/미국 보유 종목의 뉴스 영향 분석, AI 매도·보유 전망, RSI 차트, 하락 경보 알람을 제공한다.

---

## 기술 스택

| 영역 | 기술 |
|---|---|
| 모바일 | React Native (Expo) + TypeScript |
| 백엔드 | FastAPI (Python 3.11+) |
| AI | Claude API (`claude-sonnet-4-20250514`) |
| 주식 데이터 | yfinance (미국) · pykrx (한국) |
| 뉴스 | NewsAPI + Yahoo Finance RSS + 연합뉴스 RSS |
| 스케줄러 | APScheduler |
| 푸시 알람 | Expo Push Notifications |
| DB | SQLite |
| 차트 | Victory Native + react-native-svg |

---

## 주요 기능

### 1. 오늘의 브리핑
- 매일 오전 8시 자동 실행
- 뉴스 수집 → 종목별 Claude AI 분석 → 요약 생성
- BUY / HOLD / SELL 신호 + 예측 등락률 + 근거 텍스트
- 전체 시장 분위기 한줄 요약

### 2. 내 주식
- 종목 추가 (티커 · 매입가 · 수량)
- 현재가 · 평가금액 · 평가손익 · 수익률 실시간 표시
- 종목 카드 롱프레스 → 삭제
- 총 포트폴리오 손익 요약

### 3. 종목 상세
- 캔들스틱 차트 (일 / 주 / 월 전환, 가로 스크롤)
- RSI(14) 차트 — 과매도(≤30) · 과매수(≥70) 구간 음영
- AI 전망 카드 (브리핑 분석 연동)

### 4. 추천 5종목
- 당일 뉴스 기반 Claude AI 분석
- KR / US / ALL 필터
- 종목명 · 티커 · 추천 이유 · 방향(▲/▼) 표시
- 매일 브리핑 생성 시 자동 갱신

### 5. 알람
| 종류 | 조건 | 발송 시각 |
|---|---|---|
| AI 예측 알람 | 예측 하락률이 임계값 초과 | 매일 08:10 |
| 시세 알람 | 현재가가 매입가 대비 임계값 도달 | 장 중 30분마다 |

- 종목별 임계값 개별 설정 (기본 -10%)
- Expo Push — 앱 종료 상태에서도 수신
- 알람 탭 → AI 예측: 브리핑 화면 / 시세: 설정 화면 이동

---

## 스케줄러

| 시각 (KST) | 작업 |
|---|---|
| 00:05 | 하루 지난 뉴스·분석·알람 자동 삭제 |
| 07:30 | 뉴스 수집 및 DB 캐시 |
| 08:00 | AI 브리핑 생성 + 추천 5종목 갱신 |
| 08:05 | AI 예측 알람 생성 |
| 08:10 | 미발송 알람 일괄 푸시 발송 |
| 매 30분 | 시세 알람 체크 (장 시간만) |

---

## 프로젝트 구조

```
AIjusik/
├── backend/
│   ├── main.py               FastAPI 앱 진입점
│   ├── database.py           SQLite 연결
│   ├── models.py             DB 모델 (Portfolio, NewsCache, AiAnalysis, Alert, PushToken)
│   ├── scheduler.py          APScheduler 작업 정의
│   ├── verify.py             연결 검증 스크립트
│   ├── routers/
│   │   ├── stocks.py         주식 데이터 API
│   │   ├── portfolio.py      보유 종목 CRUD + 손익/RSI 포함 live 조회
│   │   ├── briefing.py       AI 브리핑 생성/조회
│   │   ├── recommend.py      추천 5종목
│   │   └── alerts.py         알람 이력 + 푸시 토큰 관리
│   └── services/
│       ├── stock_service.py  yfinance / pykrx 연동
│       ├── news_service.py   뉴스 수집 (RSS + NewsAPI)
│       ├── ai_service.py     Claude API 호출
│       ├── rsi_service.py    RSI(14) 계산
│       ├── profit_service.py 손익 계산
│       ├── alert_service.py  알람 트리거 (장 시간 필터링)
│       ├── push_service.py   Expo Push API 발송
│       └── cleanup_service.py 오래된 데이터 삭제
│
└── mobile/
    ├── app/
    │   ├── _layout.tsx        루트 레이아웃 (GestureHandlerRootView + 푸시 초기화)
    │   ├── (tabs)/
    │   │   ├── briefing.tsx   탭1: 오늘의 브리핑
    │   │   ├── portfolio.tsx  탭2: 내 주식
    │   │   ├── recommend.tsx  탭3: 추천 종목
    │   │   └── settings.tsx   탭4: 설정 (알람 임계값 · 이력)
    │   └── stock/[ticker].tsx 종목 상세 (차트 + RSI + AI 전망)
    ├── components/
    │   ├── CandleChart.tsx    SVG 캔들스틱 차트
    │   ├── RSIChart.tsx       Victory Native RSI 차트
    │   ├── StockCard.tsx      보유 종목 카드
    │   ├── BriefingItem.tsx   브리핑 분석 카드
    │   └── AlertBadge.tsx     신호 배지 모음 (RSI · Signal · Market · Direction)
    ├── services/api.ts        백엔드 API 타입 + 호출 함수
    ├── hooks/
    │   └── usePushNotifications.ts  푸시 권한 · 토큰 · 핸들러
    ├── utils/
    │   ├── format.ts          숫자/날짜 포맷
    │   ├── chartUtils.ts      일/주/월 집계, Y축 도메인
    │   └── rsiUtils.ts        RSI 계산 (프론트엔드)
    └── constants/config.ts    API_BASE_URL · 컬러 팔레트
```

---

## 시작하기

### 환경변수 설정

`backend/.env` 파일에 키를 입력한다.

```env
ANTHROPIC_API_KEY=sk-ant-...
NEWS_API_KEY=...            # 선택 (없어도 RSS 뉴스는 수집됨)
ALERT_DEFAULT_THRESHOLD=-10.0
SCHEDULER_TIMEZONE=Asia/Seoul
```

### 백엔드 실행

```bash
cd backend
pip install -r requirements.txt

# 연결 검증 (선택)
python -m backend.verify

# 서버 시작
uvicorn backend.main:app --reload
# → http://localhost:8000
# → http://localhost:8000/docs  (Swagger UI)
```

### 모바일 앱 실행

```bash
cd mobile
npm install
npx expo start
```

> **Android 에뮬레이터** 사용 시 `constants/config.ts`의 `API_BASE_URL`을 `http://10.0.2.2:8000`으로 변경한다.
> **실제 기기** 사용 시 로컬 IP로 변경한다 (예: `http://192.168.0.10:8000`).
> **푸시 알람**은 실제 기기에서만 동작한다.

---

## API 엔드포인트 요약

```
GET  /health

# 주식 데이터
GET  /stocks/{market}/{ticker}           현재가 + 60일 일봉
GET  /stocks/{market}/{ticker}/price     현재가만

# 포트폴리오
POST   /portfolio                        종목 추가
GET    /portfolio                        전체 목록 (DB)
GET    /portfolio/live                   전체 목록 + 현재가/손익/RSI
GET    /portfolio/{id}/live              단일 종목 + 현재가/손익/RSI
PUT    /portfolio/{id}                   종목 수정
DELETE /portfolio/{id}                   종목 삭제

# 브리핑
GET  /briefing/today                     오늘 브리핑 조회
POST /briefing/generate                  브리핑 생성 (강제)

# 추천
GET  /recommend?market=ALL               추천 종목 조회
POST /recommend/generate?market=ALL      추천 종목 재생성

# 알람
GET  /alerts                             알람 이력
GET  /alerts/pending                     미발송 알람
POST /alerts/register-token              Expo 푸시 토큰 등록
POST /alerts/send-pending                미발송 알람 일괄 발송
POST /alerts/check/price                 시세 알람 수동 트리거
POST /alerts/check/ai                    AI 알람 수동 트리거
DELETE /alerts/{id}                      알람 삭제
```

---

## 주의사항

- 이 앱은 **투자 권유 서비스가 아님** — AI 분석은 참고 정보 제공 목적
- yfinance는 15분 지연 데이터
- pykrx는 당일 장 마감 후 종가 기준
- Claude API 응답은 항상 JSON 파싱 예외 처리 적용
- SQLite는 단일 사용자 전제
