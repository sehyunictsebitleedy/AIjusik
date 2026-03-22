/**
 * RSI 차트 (react-native-svg)
 *
 * - RSI 라인 (파란색)
 * - 과매수 기준선 70 (빨강 점선)
 * - 과매도 기준선 30 (초록 점선)
 * - 30~70 구간 외 음영 표시
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, {
  Path,
  Line,
  Rect,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { HistoryItem } from '@/services/api';
import { COLORS } from '@/constants/config';
import { calculateRsi } from '@/utils/rsiUtils';

const RSI_HEIGHT = 140;
const RSI_PERIOD = 14;
const PADDING = { top: 10, bottom: 20, left: 36, right: 8 };

interface Props {
  history: HistoryItem[];
  currentRsi: number | null;
}

interface RsiPoint {
  index: number;
  rsi: number;
}

export default function RSIChart({ history, currentRsi }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - 28 * 2 - PADDING.left - PADDING.right; // 컨테이너 패딩 제거
  const chartHeight = RSI_HEIGHT - PADDING.top - PADDING.bottom;

  const rsiData: RsiPoint[] = useMemo(() => {
    if (history.length < RSI_PERIOD + 1) return [];
    const closes = history.map((h) => h.close);
    const points: RsiPoint[] = [];

    for (let i = RSI_PERIOD; i < closes.length; i++) {
      const slice = closes.slice(0, i + 1);
      const rsi = calculateRsi(slice, RSI_PERIOD);
      if (rsi !== null) {
        points.push({ index: i - RSI_PERIOD, rsi });
      }
    }
    return points;
  }, [history]);

  const latestRsi = currentRsi ?? rsiData[rsiData.length - 1]?.rsi ?? null;
  const rsiColor =
    latestRsi == null ? COLORS.muted
    : latestRsi <= 30 ? COLORS.success
    : latestRsi >= 70 ? COLORS.danger
    : COLORS.primary;

  // Y축 변환: RSI 0~100 → 픽셀
  const toY = (rsi: number) =>
    PADDING.top + ((100 - rsi) / 100) * chartHeight;

  // X축 변환
  const n = rsiData.length;
  const toX = (i: number) =>
    PADDING.left + (n <= 1 ? chartWidth / 2 : (i / (n - 1)) * chartWidth);

  // RSI 라인 경로
  const linePath = useMemo(() => {
    if (rsiData.length === 0) return '';
    return rsiData
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.rsi).toFixed(1)}`)
      .join(' ');
  }, [rsiData, chartWidth, chartHeight]);

  // Y축 기준선 위치
  const y70 = toY(70);
  const y30 = toY(30);
  const y50 = toY(50);

  if (rsiData.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.titleRow}>
          <Text style={styles.label}>RSI (14)</Text>
        </View>
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>데이터 부족 (최소 {RSI_PERIOD + 1}일 필요)</Text>
        </View>
      </View>
    );
  }

  const svgWidth = chartWidth + PADDING.left + PADDING.right;
  const svgHeight = RSI_HEIGHT;

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.titleRow}>
        <Text style={styles.label}>RSI (14)</Text>
        <View style={styles.valueRow}>
          {latestRsi != null && (
            <Text style={[styles.rsiValue, { color: rsiColor }]}>
              {latestRsi.toFixed(1)}
            </Text>
          )}
          <RsiSignalBadge rsi={latestRsi} />
        </View>
      </View>

      {/* 기준선 범례 */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.success }]} />
          <Text style={styles.legendText}>과매도 ≤30</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.danger }]} />
          <Text style={styles.legendText}>과매수 ≥70</Text>
        </View>
      </View>

      {/* SVG 차트 */}
      <Svg width={svgWidth} height={svgHeight}>
        <Defs>
          <LinearGradient id="oversoldGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={COLORS.success} stopOpacity="0.15" />
            <Stop offset="1" stopColor={COLORS.success} stopOpacity="0.05" />
          </LinearGradient>
          <LinearGradient id="overboughtGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={COLORS.danger} stopOpacity="0.05" />
            <Stop offset="1" stopColor={COLORS.danger} stopOpacity="0.15" />
          </LinearGradient>
        </Defs>

        {/* 과매도 구간 음영 (0~30) */}
        <Rect
          x={PADDING.left}
          y={toY(30)}
          width={chartWidth}
          height={toY(0) - toY(30)}
          fill="url(#oversoldGrad)"
        />

        {/* 과매수 구간 음영 (70~100) */}
        <Rect
          x={PADDING.left}
          y={toY(100)}
          width={chartWidth}
          height={toY(70) - toY(100)}
          fill="url(#overboughtGrad)"
        />

        {/* 기준선 70 */}
        <Line
          x1={PADDING.left}
          y1={y70}
          x2={PADDING.left + chartWidth}
          y2={y70}
          stroke={COLORS.danger}
          strokeWidth={1}
          strokeDasharray="4,3"
          strokeOpacity={0.7}
        />

        {/* 기준선 50 */}
        <Line
          x1={PADDING.left}
          y1={y50}
          x2={PADDING.left + chartWidth}
          y2={y50}
          stroke={COLORS.border}
          strokeWidth={1}
          strokeOpacity={0.5}
        />

        {/* 기준선 30 */}
        <Line
          x1={PADDING.left}
          y1={y30}
          x2={PADDING.left + chartWidth}
          y2={y30}
          stroke={COLORS.success}
          strokeWidth={1}
          strokeDasharray="4,3"
          strokeOpacity={0.7}
        />

        {/* Y축 레이블 */}
        {([100, 70, 50, 30, 0] as const).map((val) => (
          <SvgText
            key={val}
            x={PADDING.left - 4}
            y={toY(val) + 4}
            textAnchor="end"
            fontSize={9}
            fill={COLORS.muted}
          >
            {val}
          </SvgText>
        ))}

        {/* RSI 라인 */}
        {linePath ? (
          <Path
            d={linePath}
            stroke={COLORS.primary}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </Svg>
    </View>
  );
}

// ────────────────────────────────────────────
// 서브 컴포넌트
// ────────────────────────────────────────────

function RsiSignalBadge({ rsi }: { rsi: number | null }) {
  if (rsi == null) return null;
  const isOversold = rsi <= 30;
  const isOverbought = rsi >= 70;
  if (!isOversold && !isOverbought) return null;

  const color = isOversold ? COLORS.success : COLORS.danger;
  const label = isOversold ? '과매도' : '과매수';

  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rsiValue: { fontSize: 18, fontWeight: '800' },
  badge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  legendRow: { flexDirection: 'row', gap: 16, marginBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: COLORS.muted, fontSize: 11 },
  emptyBox: { height: RSI_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: COLORS.muted, fontSize: 13 },
});
