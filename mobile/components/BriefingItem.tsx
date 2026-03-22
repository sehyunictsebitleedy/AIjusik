/**
 * BriefingItem — 브리핑 탭 종목별 분석 카드
 */
import { StyleSheet, Text, View } from 'react-native';
import { BriefingAnalysis } from '@/services/api';
import { COLORS } from '@/constants/config';
import { MarketBadge, SignalBadge } from '@/components/AlertBadge';

interface Props {
  item: BriefingAnalysis;
}

export default function BriefingItem({ item }: Props) {
  const hasPredict = item.predicted_change_pct != null;
  const isUp = (item.predicted_change_pct ?? 0) >= 0;

  return (
    <View style={styles.card}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.left}>
          <View style={styles.tickerRow}>
            <Text style={styles.ticker}>{item.ticker}</Text>
            <MarketBadge market={item.market} />
          </View>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        </View>
        <SignalBadge signal={item.signal} />
      </View>

      {/* 수치 정보 */}
      <View style={styles.metaRow}>
        {item.rsi_value != null && (
          <MetaChip label="RSI" value={item.rsi_value.toFixed(1)} />
        )}
        {hasPredict && (
          <MetaChip
            label="예측"
            value={`${isUp ? '+' : ''}${item.predicted_change_pct!.toFixed(1)}%`}
            color={isUp ? COLORS.up : COLORS.down}
          />
        )}
        {item.risk_level && (
          <MetaChip
            label="리스크"
            value={item.risk_level}
            color={
              item.risk_level === 'HIGH' ? COLORS.danger
              : item.risk_level === 'LOW' ? COLORS.success
              : COLORS.warning
            }
          />
        )}
      </View>

      {/* AI 근거 */}
      {item.reason && (
        <Text style={styles.reason}>{item.reason}</Text>
      )}
    </View>
  );
}

function MetaChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={[styles.chipValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  left: { flex: 1, marginRight: 10 },
  tickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  ticker: { color: COLORS.text, fontWeight: '700', fontSize: 16 },
  name: { color: COLORS.muted, fontSize: 12 },
  metaRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.bg,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipLabel: { color: COLORS.muted, fontSize: 11 },
  chipValue: { color: COLORS.text, fontSize: 12, fontWeight: '700' },
  reason: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 20,
    opacity: 0.85,
  },
});
