# 📈 AI 개인 투자 어시스턴트

> 내 주식을 매일 아침 AI가 브리핑해주는 개인용 모바일 앱

국내/미국 보유 종목의 뉴스 영향 분석, AI 매도·보유 전망, RSI 차트, 하락 경보 알람을 제공한다.

---

## 기술 스택

| 영역 | 기술 |
|---|---|
| 모바일 | React Native (Expo SDK 52) + TypeScript |
| 백엔드 | FastAPI (Python 3.11+) |
| AI | Claude API (`claude-sonnet-4-20250514`) |
| 주식 데이터 | yfinance ≥0.2.54 (미국) · pykrx (한국) |
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
- 브리핑 화면에 보유 종목 현황 (매입가·수량) 함께 표시

### 2. 내 주식
- 종목 추가: 시장(KR/US) 선택 → 티커 직접 입력 → **확인** 버튼으로 종목명 검증
- 현재가 · 평가금액 · 평가손익 · 수익률 표시 (종가 기준)
  - KR: 원화(₩), US: 달러($)
- 종목 카드 하단 **수정** 버튼 → 매입가·수량 수정
- 종목 카드 하단 **삭제** 버튼 → 종목 삭제 (확인 다이얼로그)
- 총 포트폴리오 손익 요약 카드

### 3. 종목 상세
- 캔들스틱 차트 (일 / 주 / 월 전환, 가로 스크롤)
- RSI(14) 차트 — 과매도(≤30) · 과매수(≥70) 구간 음영
- AI 전망 카드
  - 판정 배너: BUY / HOLD / SELL + 예측 등락률
  - 변동성 위험 등급 (LOW / MEDIUM / HIGH) · RSI 칩
  - 예상 변동성 한줄 요약
  - 핵심 영향 요인 3가지
  - 매도 목표가 (가격 · 이유 · 예상 기간)
  - AI 분석 근거 텍스트
- **AI 분석 시작** / **재분석** 버튼 — 브리핑 없이 즉시 단일 종목 분석

### 4. 추천 종목
- 당일 뉴스 기반 Claude AI 분석
- KR 5종목 / US 5종목 별도 생성
- 탭 필터: 전체 / 🇰🇷 한국 / 🇺🇸 미국
- 종목명 · 티커 · 추천 이유 · 방향(▲/▼) 표시
- **AI 추천 새로 받기** 버튼으로 수동 갱신

### 5. 알람
| 종류 | 조건 | 발송 시각 |
|---|---|---|
| AI 예측 알람 | 예측 하락률이 임계값 초과 | 매일 08:10 |
| 시세 알람 | 현재가가 매입가 대비 임계값 도달 | 장 중 30분마다 |

- 종목별 임계값 개별 설정 (기본 -10%)
- Expo Push — 앱 종료 상태에서도 수신

---

## 스케줄러

| 시각 (KST) | 작업 |
|---|---|
| 00:05 | 하루 지난 뉴스·분석·알람 자동 삭제 |
| 07:30 | 뉴스 수집 및 DB 캐시 |
| 08:00 | AI 브리핑 생성 + 추천 종목 갱신 |
| 08:05 | AI 예측 알람 생성 |
| 08:10 | 미발송 알람 일괄 푸시 발송 |
| 매 30분 | 시세 알람 체크 (장 시간만) |

---

## 프로젝트 구조

```
AIjusik/
├── backend/
│   ├── main.py               FastAPI 앱 진입점 (서버 시작 시 KR 종목 캐시 백그라운드 빌드)
│   ├── database.py           SQLite 연결
│   ├── models.py             DB 모델 (Portfolio, NewsCache, AiAnalysis, Alert, PushToken)
│   ├── scheduler.py          APScheduler 작업 정의
│   ├── routers/
│   │   ├── stocks.py         주식 데이터 API + 티커 유효성 확인
│   │   ├── portfolio.py      보유 종목 CRUD + 손익/RSI 포함 live 조회
│   │   ├── briefing.py       AI 브리핑 생성/조회 + 단일 종목 즉시 분석
│   │   ├── recommend.py      추천 종목 (KR/US 별도)
│   │   └── alerts.py         알람 이력 + 푸시 토큰 관리
│   └── services/
│       ├── stock_service.py  yfinance / pykrx 연동 + KR 종목명 인메모리 캐시
│       ├── news_service.py   뉴스 수집 (RSS + NewsAPI)
│       ├── ai_service.py     Claude API 호출 (분석·브리핑·추천)
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
    │   │   ├── index.tsx      /briefing 리다이렉트
    │   │   ├── briefing.tsx   탭1: 오늘의 브리핑 (보유 종목 현황 포함)
    │   │   ├── portfolio.tsx  탭2: 내 주식 (추가·수정·삭제·손익)
    │   │   ├── recommend.tsx  탭3: 추천 종목 (KR/US 탭 분리)
    │   │   └── settings.tsx   탭4: 설정 (알람 임계값·이력)
    │   └── stock/[ticker].tsx 종목 상세 (차트 + RSI + AI 전망 + 즉시 분석)
    ├── components/
    │   ├── CandleChart.tsx    SVG 캔들스틱 차트
    │   ├── RSIChart.tsx       Victory Native RSI 차트
    │   ├── StockCard.tsx      보유 종목 카드 (수정·삭제 버튼 분리)
    │   ├── BriefingItem.tsx   브리핑 분석 카드
    │   └── AlertBadge.tsx     신호 배지 모음 (RSI · Signal · Market · Direction)
    ├── services/api.ts        백엔드 API 타입 + 호출 함수
    ├── hooks/
    │   └── usePushNotifications.ts  푸시 권한·토큰·핸들러
    ├── utils/
    │   ├── format.ts          숫자/날짜 포맷 (KR: 원화, US: 달러)
    │   ├── chartUtils.ts      일/주/월 집계, Y축 도메인
    │   └── rsiUtils.ts        RSI 계산 (프론트엔드)
    └── constants/config.ts    API_BASE_URL · 컬러 팔레트
```

---

## 시작하기

### 환경변수 설정

`backend/.env` 파일 생성 후 키 입력.

```env
ANTHROPIC_API_KEY=sk-ant-...
NEWS_API_KEY=...            # 선택 (없어도 RSS 뉴스는 수집됨)
ALERT_DEFAULT_THRESHOLD=-10.0
SCHEDULER_TIMEZONE=Asia/Seoul
```

### 백엔드 실행

> Python 3.11 필수 (3.12+ 권장 / 3.14 비호환)

```bash
# 프로젝트 루트에서 실행 (backend/ 안에서 실행하면 import 오류 발생)
cd AIjusik

pip install -r backend/requirements.txt

# 서버 시작
python -m uvicorn backend.main:app --reload --port 8000
# → http://localhost:8000
# → http://localhost:8000/docs  (Swagger UI)
```

> 서버 시작 시 KR 전체 종목 캐시를 백그라운드에서 빌드합니다. 로그에 `KR 종목 캐시 완료: N개` 메시지가 뜨면 종목 검색이 즉시 동작합니다.

### 모바일 앱 실행

```bash
cd mobile
npm install --legacy-peer-deps
npx expo start --web   # 브라우저에서 확인
npx expo start         # Expo Go 앱으로 확인 (SDK 52 필요)
```

> **Expo Go** 앱은 SDK 52 버전 필요.
> **Android 에뮬레이터** 사용 시 `constants/config.ts`의 `API_BASE_URL`을 `http://10.0.2.2:8000`으로 변경.
> **실제 기기** 사용 시 로컬 IP로 변경 (예: `http://192.168.0.10:8000`).
> **푸시 알람**은 실제 기기에서만 동작.

---

## API 엔드포인트 요약

```
GET  /health

# 주식 데이터
GET  /stocks/validate/{market}/{ticker}  티커 유효성 확인 + 종목명 반환
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
POST /briefing/generate                  브리핑 전체 생성
POST /briefing/analyze/{stock_id}        단일 종목 즉시 AI 분석

# 추천
GET  /recommend?market=KR|US|ALL         추천 종목 조회
POST /recommend/generate?market=KR|US|ALL 추천 종목 재생성

# 알람
GET    /alerts                           알람 이력
GET    /alerts/pending                   미발송 알람
POST   /alerts/register-token           Expo 푸시 토큰 등록
POST   /alerts/send-pending             미발송 알람 일괄 발송
DELETE /alerts/{id}                      알람 삭제
```

---

## 주의사항

- 이 앱은 **투자 권유 서비스가 아님** — AI 분석은 참고 정보 제공 목적
- yfinance는 15분 지연 데이터 (≥0.2.54 필요 — Yahoo Finance 쿠키 이슈 수정본)
- pykrx는 당일 장 마감 후 종가 기준
- Claude API 응답은 항상 JSON 파싱 예외 처리 적용
- SQLite는 단일 사용자 전제
