/**
 * 프론트엔드용 RSI 계산 (백엔드 rsi_service.py와 동일 로직)
 * Wilder's Smoothing 방식 (14일 표준)
 */
export function calculateRsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  const deltas = closes.map((c, i) => (i === 0 ? 0 : c - closes[i - 1])).slice(1);

  const initGains = deltas.slice(0, period).map((d) => (d > 0 ? d : 0));
  const initLosses = deltas.slice(0, period).map((d) => (d < 0 ? -d : 0));

  let avgGain = initGains.reduce((s, v) => s + v, 0) / period;
  let avgLoss = initLosses.reduce((s, v) => s + v, 0) / period;

  for (const delta of deltas.slice(period)) {
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}
