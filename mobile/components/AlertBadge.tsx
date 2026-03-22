/**
 * AlertBadge — RSI 신호 / AI 신호 / 시장 배지 공통 컴포넌트
 */
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '@/constants/config';
import { RsiSignal, Signal } from '@/services/api';

// ── RSI 신호 배지 ──────────────────────────

const RSI_MAP: Record<RsiSignal, { label: string; color: string }> = {
  OVERSOLD:   { label: '과매도', color: COLORS.success },
  NEUTRAL:    { label: '중립',   color: COLORS.muted },
  OVERBOUGHT: { label: '과매수', color: COLORS.danger },
  UNKNOWN:    { label: '—',      color: COLORS.muted },
};

export function RsiBadge({ signal }: { signal: RsiSignal }) {
  const { label, color } = RSI_MAP[signal] ?? RSI_MAP.UNKNOWN;
  if (signal === 'NEUTRAL' || signal === 'UNKNOWN') return null;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ── AI 신호 배지 ───────────────────────────

const SIGNAL_MAP: Record<Signal, { label: string; color: string }> = {
  BUY:  { label: '매수',  color: COLORS.success },
  HOLD: { label: '보유',  color: COLORS.warning },
  SELL: { label: '매도',  color: COLORS.danger },
};

export function SignalBadge({ signal, large }: { signal: Signal; large?: boolean }) {
  const { label, color } = SIGNAL_MAP[signal] ?? SIGNAL_MAP.HOLD;
  return (
    <View style={[
      styles.signalBadge,
      { backgroundColor: color + '22' },
      large && styles.signalBadgeLarge,
    ]}>
      <Text style={[
        styles.signalText,
        { color },
        large && styles.signalTextLarge,
      ]}>
        {label}
      </Text>
    </View>
  );
}

// ── 시장 배지 ──────────────────────────────

export function MarketBadge({ market }: { market: 'KR' | 'US' }) {
  return (
    <View style={styles.marketBadge}>
      <Text style={styles.marketText}>{market}</Text>
    </View>
  );
}

// ── 방향 배지 (추천 종목) ──────────────────

export function DirectionBadge({ direction }: { direction: 'UP' | 'DOWN' }) {
  const isUp = direction === 'UP';
  return (
    <Text style={[styles.directionText, { color: isUp ? COLORS.up : COLORS.down }]}>
      {isUp ? '▲' : '▼'}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  signalBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  signalBadgeLarge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  signalText: { fontWeight: '700', fontSize: 13 },
  signalTextLarge: { fontSize: 16 },
  marketBadge: {
    backgroundColor: COLORS.border,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  marketText: { color: COLORS.muted, fontSize: 11 },
  directionText: { fontWeight: '700', fontSize: 15 },
});
