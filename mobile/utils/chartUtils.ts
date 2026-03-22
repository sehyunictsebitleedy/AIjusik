/**
 * 차트 데이터 유틸리티
 * - 일봉 → 주봉/월봉 집계
 * - 차트 표시용 포맷 변환
 */
import { HistoryItem } from '@/services/api';

export type Period = '1M' | '3M' | '6M';

/**
 * 기간에 맞게 일봉 데이터를 필터링한다.
 */
export function filterByPeriod(history: HistoryItem[], period: Period): HistoryItem[] {
  const now = new Date();
  const months = period === '1M' ? 1 : period === '3M' ? 3 : 6;
  const cutoff = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  const cutoffStr = cutoff.toISOString().split('T')[0];
  return history.filter((d) => d.date >= cutoffStr);
}

/**
 * 일봉 → 주봉 집계
 * 주 시작: 월요일 기준
 */
export function toWeekly(history: HistoryItem[]): HistoryItem[] {
  if (history.length === 0) return [];

  const weeks: Record<string, HistoryItem[]> = {};
  for (const bar of history) {
    const d = new Date(bar.date);
    // 월요일 날짜를 키로 사용
    const day = d.getDay(); // 0=일, 1=월
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    const key = monday.toISOString().split('T')[0];
    if (!weeks[key]) weeks[key] = [];
    weeks[key].push(bar);
  }

  return Object.entries(weeks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, bars]) => ({
      date: weekStart,
      open: bars[0].open,
      high: Math.max(...bars.map((b) => b.high)),
      low: Math.min(...bars.map((b) => b.low)),
      close: bars[bars.length - 1].close,
      volume: bars.reduce((s, b) => s + b.volume, 0),
    }));
}

/**
 * 일봉 → 월봉 집계
 */
export function toMonthly(history: HistoryItem[]): HistoryItem[] {
  if (history.length === 0) return [];

  const months: Record<string, HistoryItem[]> = {};
  for (const bar of history) {
    const key = bar.date.slice(0, 7); // 'YYYY-MM'
    if (!months[key]) months[key] = [];
    months[key].push(bar);
  }

  return Object.entries(months)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, bars]) => ({
      date: `${month}-01`,
      open: bars[0].open,
      high: Math.max(...bars.map((b) => b.high)),
      low: Math.min(...bars.map((b) => b.low)),
      close: bars[bars.length - 1].close,
      volume: bars.reduce((s, b) => s + b.volume, 0),
    }));
}

/**
 * 차트 Y축 최솟값/최댓값 계산 (여백 포함)
 */
export function calcYDomain(
  bars: HistoryItem[],
  padding = 0.05,
): { min: number; max: number } {
  if (bars.length === 0) return { min: 0, max: 100 };
  const lows = bars.map((b) => b.low);
  const highs = bars.map((b) => b.high);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const margin = (max - min) * padding;
  return { min: min - margin, max: max + margin };
}

/**
 * 가격 포맷 (한국: 정수, 미국: 소수점 2자리)
 */
export function formatPrice(price: number, market: 'KR' | 'US'): string {
  if (market === 'KR') return Math.round(price).toLocaleString();
  return price.toFixed(2);
}

/**
 * 날짜 라벨 포맷
 */
export function formatDateLabel(date: string, view: 'daily' | 'weekly' | 'monthly'): string {
  if (view === 'monthly') return date.slice(0, 7); // YYYY-MM
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`; // M/D
}
