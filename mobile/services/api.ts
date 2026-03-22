/**
 * 백엔드 API 호출 서비스
 * 모든 fetch는 이 파일을 통해 호출한다.
 */
import { API_BASE_URL } from '@/constants/config';

// ────────────────────────────────────────────
// 공통 타입
// ────────────────────────────────────────────

export type Market = 'KR' | 'US';
export type Signal = 'BUY' | 'HOLD' | 'SELL';
export type Direction = 'UP' | 'DOWN';
export type RsiSignal = 'OVERSOLD' | 'NEUTRAL' | 'OVERBOUGHT' | 'UNKNOWN';

export interface HistoryItem {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockData {
  ticker: string;
  name: string;
  market: Market;
  current_price: number;
  prev_close: number;
  change_pct: number;
  history: HistoryItem[];
}

export interface PortfolioItem {
  id: number;
  ticker: string;
  name: string;
  market: Market;
  buy_price: number;
  quantity: number;
  buy_date: string | null;
  alert_threshold: number;
  created_at: string;
}

export interface PortfolioCreate {
  ticker: string;
  name: string;
  market: Market;
  buy_price: number;
  quantity: number;
  buy_date?: string;
  alert_threshold?: number;
}

export interface PortfolioUpdate {
  name?: string;
  buy_price?: number;
  quantity?: number;
  buy_date?: string;
  alert_threshold?: number;
}

export interface LiveStockItem extends PortfolioItem {
  current_price: number;
  change_pct: number;
  buy_value: number;
  current_value: number;
  profit_loss: number;
  return_pct: number;
  rsi: number | null;
  rsi_signal: RsiSignal;
  error?: string;
}

export interface BriefingAnalysis {
  stock_id: number;
  ticker: string;
  name: string;
  market: Market;
  signal: Signal;
  predicted_change_pct: number | null;
  reason: string | null;
  risk_level: string | null;
  rsi_value: number | null;
}

export interface BriefingResponse {
  date: string;
  summary: string;
  analyses: BriefingAnalysis[];
}

export interface RecommendItem {
  ticker: string;
  name: string;
  market: Market;
  reason: string;
  direction: Direction;
}

export interface RecommendResponse {
  date: string;
  market: string;
  items: RecommendItem[];
}

export interface AlertItem {
  id: number;
  stock_id: number;
  ticker: string | null;
  name: string | null;
  alert_type: string | null;
  message: string | null;
  triggered_at: string;
  is_sent: number;
}

// ────────────────────────────────────────────
// 공통 fetch 헬퍼
// ────────────────────────────────────────────

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `HTTP ${res.status}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}

// ────────────────────────────────────────────
// 주식 데이터
// ────────────────────────────────────────────

export const stockApi = {
  getStock: (market: Market, ticker: string) =>
    request<StockData>(`/stocks/${market}/${ticker}`),

  getPrice: (market: Market, ticker: string) =>
    request<Omit<StockData, 'history'>>(`/stocks/${market}/${ticker}/price`),
};

// ────────────────────────────────────────────
// 포트폴리오
// ────────────────────────────────────────────

export const portfolioApi = {
  list: () =>
    request<PortfolioItem[]>('/portfolio'),

  listLive: () =>
    request<LiveStockItem[]>('/portfolio/live'),

  get: (id: number) =>
    request<PortfolioItem>(`/portfolio/${id}`),

  getLive: (id: number) =>
    request<LiveStockItem>(`/portfolio/${id}/live`),

  add: (body: PortfolioCreate) =>
    request<PortfolioItem>('/portfolio', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (id: number, body: PortfolioUpdate) =>
    request<PortfolioItem>(`/portfolio/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  remove: (id: number) =>
    request<void>(`/portfolio/${id}`, { method: 'DELETE' }),
};

// ────────────────────────────────────────────
// 브리핑
// ────────────────────────────────────────────

export const briefingApi = {
  today: () =>
    request<BriefingResponse>('/briefing/today'),

  generate: () =>
    request<BriefingResponse>('/briefing/generate', { method: 'POST' }),
};

// ────────────────────────────────────────────
// 추천 종목
// ────────────────────────────────────────────

export const recommendApi = {
  get: (market: 'KR' | 'US' | 'ALL' = 'ALL') =>
    request<RecommendResponse>(`/recommend?market=${market}`),

  generate: (market: 'KR' | 'US' | 'ALL' = 'ALL') =>
    request<RecommendResponse>(`/recommend/generate?market=${market}`, {
      method: 'POST',
    }),
};

// ────────────────────────────────────────────
// 알람
// ────────────────────────────────────────────

export interface PushTokenResponse {
  token: string | null;
  registered: boolean;
}

export interface SendResult {
  sent: number;
  failed: number;
}

export const alertApi = {
  list: () =>
    request<AlertItem[]>('/alerts'),

  pending: () =>
    request<AlertItem[]>('/alerts/pending'),

  remove: (id: number) =>
    request<void>(`/alerts/${id}`, { method: 'DELETE' }),

  registerToken: (token: string) =>
    request<PushTokenResponse>('/alerts/register-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  getPushToken: () =>
    request<PushTokenResponse>('/alerts/push-token'),

  sendPending: () =>
    request<SendResult>('/alerts/send-pending', { method: 'POST' }),
};
