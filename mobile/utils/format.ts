/**
 * 숫자/날짜 포맷 유틸리티
 */
import { Market } from '@/services/api';

/** 가격 포맷 — KR: 정수 천단위, US: 소수점 2자리 */
export function formatPrice(price: number, market: Market): string {
  if (market === 'KR') return Math.round(price).toLocaleString('ko-KR') + '원';
  return '$' + price.toFixed(2);
}

/** 등락률 포맷 — 부호 + 색상 정보 포함 */
export function formatChangePct(pct: number): { text: string; isUp: boolean } {
  const isUp = pct >= 0;
  return {
    text: `${isUp ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}%`,
    isUp,
  };
}

/** 손익 금액 포맷 */
export function formatProfitLoss(amount: number, market: Market): string {
  const prefix = amount >= 0 ? '+' : '';
  if (market === 'KR') return `${prefix}${Math.round(amount).toLocaleString('ko-KR')}원`;
  return `${prefix}$${Math.abs(amount).toFixed(2)}`;
}

/** 수익률 포맷 */
export function formatReturnPct(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

/** 날짜 포맷 — 'YYYY-MM-DD' → 'MM/DD' 또는 'YYYY.MM.DD' */
export function formatDate(dateStr: string, style: 'short' | 'full' = 'full'): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  if (style === 'short') return `${parseInt(month)}/${parseInt(day)}`;
  return `${year}.${month}.${day}`;
}

/** ISO timestamp → 한국어 상대 시간 */
export function formatRelativeTime(isoStr: string): string {
  const now = Date.now();
  const then = new Date(isoStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}일 전`;
}
