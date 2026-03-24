/**
 * BriefingItem — 브리핑 탭 종목별 분석 카드
 * signal 기반으로 위험/보유유지/추가매수 판정을 직관적으로 표시
 */
import { StyleSheet, Text, View } from 'react-native';
import { BriefingAnalysis } from '@/services/api';
import { COLORS } from '@/constants/config';
import { MarketBadge } from '@/components/AlertBadge';

interface Props {
  item: BriefingAnalysis;
}

const VERDICT: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  SELL: { label: '위험 · 매도 고려', emoji: '🔴', color: COLORS.danger, bg: COLORS.danger + '20' },
  HOLD: { label: '보유 유지',       emoji: '🟡', color: COLORS.warning, bg: COLORS.warning + '20' },
  BUY:  { label: '추가매수 추천',   emoji: '🟢', color: COLORS.success, bg: COLORS.success + '20' },
};

const RISK_LABEL: Record<string, { label: string; color: string }> = {
  HIGH:   { label: '변동 위험 높음', color: COLORS.danger },
  MEDIUM: { label: '변동 주의',      color: COLORS.warning },
  LOW:    { label: '안정적',         color: COLORS.success },
};

export default function BriefingItem({ item }: Props) {
  const verdict = VERDICT[item.signal] ?? VERDICT.HOLD;
  const risk = item.risk_level ? RISK_LABEL[item.risk_level] : null;
  const hasPredict = item.predicted_change_pct != null;
  const isUp = (item.predicted_change_pct ?? 0) >= 0;

  return (
    <View style={styles.card}>
      {/* 종목명 + 시장 */}
      <View style={styles.header}>
        <View style={styles.tickerRow}>
          <Text style={styles.ticker}>{item.ticker}</Text>
          <MarketBadge market={item.market} />
        </View>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
      </View>

      {/* 판정 배너 */}
      <View style={[styles.verdictBanner, { backgroundColor: verdict.bg }]}>
        <Text style={[styles.verdictText, { color: verdict.color }]}>
          {verdict.emoji}  {verdict.label}
        </Text>
        {hasPredict && (
          <Text style={[styles.predictText, { color: isUp ? COLORS.up : COLORS.down }]}>
            예측 {isUp ? '+' : ''}{item.predicted_change_pct!.toFixed(1)}%
          </Text>
        )}
      </View>

      {/* 변동성 + 리스크 */}
      <View style={styles.metaRow}>
        {risk && (
          <View style={styles.chip}>
            <Text style={[styles.chipText, { color: risk.color }]}>{risk.label}</Text>
          </View>
        )}
        {item.rsi_value != null && (
          <View style={styles.chip}>
            <Text style={styles.chipText}>RSI {item.rsi_value.toFixed(1)}</Text>
          </View>
        )}
      </View>

      {/* AI 근거 */}
      {item.reason && (
        <Text style={styles.reason}>{item.reason}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  header: { marginBottom: 10 },
  tickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  ticker: { color: COLORS.text, fontWeight: '700', fontSize: 17 },
  name: { color: COLORS.muted, fontSize: 12 },
  verdictBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  verdictText: { fontSize: 15, fontWeight: '700' },
  predictText: { fontSize: 13, fontWeight: '600' },
  metaRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  chip: {
    backgroundColor: COLORS.bg,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipText: { color: COLORS.muted, fontSize: 12, fontWeight: '600' },
  reason: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 21,
    opacity: 0.85,
  },
});
