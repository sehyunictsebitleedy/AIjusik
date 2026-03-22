/**
 * 캔들스틱 차트
 *
 * react-native-svg로 직접 구현 (Victory Native에 캔들스틱 없음)
 * - 상승봉: 빨강 (한국식)
 * - 하락봉: 파랑 (한국식)
 * - 위/아래 꼬리: 고가/저가
 * - 주기 선택: 일 / 주 / 월
 */
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { HistoryItem } from '@/services/api';
import { COLORS } from '@/constants/config';
import {
  calcYDomain,
  filterByPeriod,
  formatDateLabel,
  formatPrice,
  Period,
  toMonthly,
  toWeekly,
} from '@/utils/chartUtils';

type ViewMode = '일' | '주' | '월';

const PERIOD_MAP: Record<ViewMode, Period> = {
  일: '3M',
  주: '6M',
  월: '6M',
};

const CHART_HEIGHT = 220;
const LABEL_HEIGHT = 20;
const CANDLE_WIDTH = 8;
const CANDLE_GAP = 4;

interface Props {
  history: HistoryItem[];
  market: 'KR' | 'US';
}

export default function CandleChart({ history, market }: Props) {
  const [view, setView] = useState<ViewMode>('일');

  // 기간 필터 + 주기 집계
  const bars = useMemo(() => {
    const filtered = filterByPeriod(history, PERIOD_MAP[view]);
    if (view === '주') return toWeekly(filtered);
    if (view === '월') return toMonthly(filtered);
    return filtered;
  }, [history, view]);

  const { min: yMin, max: yMax } = useMemo(() => calcYDomain(bars), [bars]);
  const yRange = yMax - yMin || 1;

  const chartWidth = bars.length * (CANDLE_WIDTH + CANDLE_GAP);

  // Y 좌표 변환
  const toY = (price: number) =>
    CHART_HEIGHT - ((price - yMin) / yRange) * CHART_HEIGHT;

  // Y축 라벨 (3개)
  const yLabels = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <View style={styles.container}>
      {/* 주기 선택 */}
      <View style={styles.viewSelector}>
        {(['일', '주', '월'] as ViewMode[]).map((v) => (
          <TouchableOpacity
            key={v}
            style={[styles.viewBtn, view === v && styles.viewBtnActive]}
            onPress={() => setView(v)}
          >
            <Text style={[styles.viewBtnText, view === v && styles.viewBtnTextActive]}>
              {v}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Y축 라벨 + 차트 */}
      <View style={styles.chartWrapper}>
        {/* Y축 */}
        <View style={[styles.yAxis, { height: CHART_HEIGHT }]}>
          {yLabels.reverse().map((price, i) => (
            <Text key={i} style={styles.yLabel}>
              {formatPrice(price, market)}
            </Text>
          ))}
        </View>

        {/* 스크롤 가능한 캔들 영역 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: 8 }}
        >
          <Svg
            width={Math.max(chartWidth, 100)}
            height={CHART_HEIGHT + LABEL_HEIGHT}
          >
            {bars.map((bar, i) => {
              const x = i * (CANDLE_WIDTH + CANDLE_GAP) + CANDLE_GAP;
              const cx = x + CANDLE_WIDTH / 2;

              const openY = toY(bar.open);
              const closeY = toY(bar.close);
              const highY = toY(bar.high);
              const lowY = toY(bar.low);

              const isUp = bar.close >= bar.open;
              const color = isUp ? COLORS.up : COLORS.down;

              const bodyTop = Math.min(openY, closeY);
              const bodyH = Math.max(Math.abs(openY - closeY), 1);

              // X축 라벨: 첫 번째, 중간, 마지막만 표시
              const showLabel =
                i === 0 ||
                i === Math.floor(bars.length / 2) ||
                i === bars.length - 1;

              return (
                <React.Fragment key={bar.date}>
                  {/* 위 꼬리 */}
                  <Line
                    x1={cx} y1={highY}
                    x2={cx} y2={bodyTop}
                    stroke={color}
                    strokeWidth={1}
                  />
                  {/* 몸통 */}
                  <Rect
                    x={x}
                    y={bodyTop}
                    width={CANDLE_WIDTH}
                    height={bodyH}
                    fill={isUp ? color : 'transparent'}
                    stroke={color}
                    strokeWidth={1}
                  />
                  {/* 아래 꼬리 */}
                  <Line
                    x1={cx} y1={bodyTop + bodyH}
                    x2={cx} y2={lowY}
                    stroke={color}
                    strokeWidth={1}
                  />
                  {/* X축 날짜 라벨 */}
                  {showLabel && (
                    <SvgText
                      x={cx}
                      y={CHART_HEIGHT + LABEL_HEIGHT - 4}
                      fontSize={9}
                      fill={COLORS.muted}
                      textAnchor="middle"
                    >
                      {formatDateLabel(
                        bar.date,
                        view === '일' ? 'daily' : view === '주' ? 'weekly' : 'monthly',
                      )}
                    </SvgText>
                  )}
                </React.Fragment>
              );
            })}
          </Svg>
        </ScrollView>
      </View>
    </View>
  );
}

// React import for Fragment
import React from 'react';

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  viewSelector: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  viewBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  viewBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  viewBtnText: { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  viewBtnTextActive: { color: COLORS.text },
  chartWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  yAxis: {
    width: 60,
    justifyContent: 'space-between',
    paddingVertical: 2,
    marginRight: 4,
  },
  yLabel: {
    color: COLORS.muted,
    fontSize: 9,
    textAlign: 'right',
  },
});
