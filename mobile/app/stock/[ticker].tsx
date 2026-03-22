/**
 * 종목 상세 화면
 * - 현재가 / 손익 정보
 * - 캔들스틱 차트 (일/주/월)
 * - RSI 차트 (14일, 과매도/과매수 구간 음영)
 * - AI 전망 (브리핑 분석 결과)
 */
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  BriefingAnalysis,
  briefingApi,
  LiveStockItem,
  Market,
  portfolioApi,
  StockData,
  stockApi,
} from '@/services/api';
import { COLORS } from '@/constants/config';
import CandleChart from '@/components/CandleChart';
import RSIChart from '@/components/RSIChart';

const SIGNAL_COLOR: Record<string, string> = {
  BUY: COLORS.success,
  HOLD: COLORS.warning,
  SELL: COLORS.danger,
};
const SIGNAL_LABEL: Record<string, string> = {
  BUY: '매수 관심',
  HOLD: '보유 유지',
  SELL: '매도 검토',
};

export default function StockDetailScreen() {
  const { ticker, market, stockId } = useLocalSearchParams<{
    ticker: string;
    market: Market;
    stockId: string;
  }>();

  const [liveData, setLiveData] = useState<LiveStockItem | null>(null);
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [analysis, setAnalysis] = useState<BriefingAnalysis | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!ticker || !market) return;
    setLoading(true);
    try {
      const [live, stock] = await Promise.all([
        stockId ? portfolioApi.getLive(Number(stockId)) : Promise.resolve(null),
        stockApi.getStock(market, ticker),
      ]);
      if (live) setLiveData(live);
      setStockData(stock);

      // 오늘 브리핑에서 해당 종목 AI 분석 조회
      try {
        const briefing = await briefingApi.today();
        const found = briefing.analyses.find((a) => a.ticker === ticker);
        if (found) setAnalysis(found);
      } catch {
        // 브리핑 없어도 무관
      }
    } catch {
      // 에러는 로딩 인디케이터로만 처리
    } finally {
      setLoading(false);
    }
  }, [ticker, market, stockId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading && !stockData) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  const currentPrice = liveData?.current_price ?? stockData?.current_price ?? 0;
  const changePct = stockData?.change_pct ?? 0;
  const isUp = changePct >= 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.primary} />
      }
    >
      {/* ── 가격 헤더 ── */}
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.tickerText}>{ticker}</Text>
            <Text style={styles.nameText}>
              {liveData?.name ?? stockData?.name ?? ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.priceText}>{currentPrice.toLocaleString()}</Text>
            <Text style={[styles.changePct, { color: isUp ? COLORS.up : COLORS.down }]}>
              {isUp ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%
            </Text>
          </View>
        </View>

        {/* 손익 (포트폴리오 종목인 경우) */}
        {liveData && (
          <View style={styles.profitRow}>
            <ProfitCell label="매입가" value={liveData.buy_price.toLocaleString()} />
            <ProfitCell label="수량" value={`${liveData.quantity}주`} />
            <ProfitCell
              label="손익"
              value={`${liveData.profit_loss >= 0 ? '+' : ''}${liveData.profit_loss.toLocaleString()}`}
              color={liveData.profit_loss >= 0 ? COLORS.up : COLORS.down}
            />
            <ProfitCell
              label="수익률"
              value={`${liveData.return_pct >= 0 ? '+' : ''}${liveData.return_pct.toFixed(2)}%`}
              color={liveData.return_pct >= 0 ? COLORS.up : COLORS.down}
            />
          </View>
        )}
      </View>

      {/* ── 캔들스틱 차트 ── */}
      {stockData && stockData.history.length > 0 && (
        <CandleChart history={stockData.history} market={market} />
      )}

      {/* ── RSI 차트 ── */}
      {stockData && stockData.history.length > 0 && (
        <RSIChart
          history={stockData.history}
          currentRsi={liveData?.rsi ?? null}
        />
      )}

      {/* ── AI 전망 ── */}
      <AiSignalCard analysis={analysis} liveData={liveData} />
    </ScrollView>
  );
}

// ────────────────────────────────────────────
// 서브 컴포넌트
// ────────────────────────────────────────────

function ProfitCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.profitCell}>
      <Text style={styles.profitLabel}>{label}</Text>
      <Text style={[styles.profitValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function AiSignalCard({
  analysis,
  liveData,
}: {
  analysis: BriefingAnalysis | null;
  liveData: LiveStockItem | null;
}) {
  // 브리핑 분석 있으면 사용, 없으면 RSI 기반 fallback
  const signal = analysis?.signal
    ?? (liveData?.rsi_signal === 'OVERSOLD' ? 'BUY'
      : liveData?.rsi_signal === 'OVERBOUGHT' ? 'SELL'
      : 'HOLD');

  const color = SIGNAL_COLOR[signal] ?? COLORS.muted;
  const label = SIGNAL_LABEL[signal] ?? signal;

  return (
    <View style={[styles.aiCard, { borderLeftColor: color }]}>
      <Text style={styles.sectionLabel}>AI 전망</Text>
      <View style={[styles.signalBadge, { backgroundColor: color + '22' }]}>
        <Text style={[styles.signalText, { color }]}>{label}</Text>
      </View>

      {analysis ? (
        <>
          <View style={styles.aiMetaRow}>
            {analysis.rsi_value != null && (
              <Text style={styles.aiMeta}>RSI {analysis.rsi_value.toFixed(1)}</Text>
            )}
            {analysis.predicted_change_pct != null && (
              <Text style={[
                styles.aiMeta,
                { color: analysis.predicted_change_pct >= 0 ? COLORS.up : COLORS.down },
              ]}>
                예측 {analysis.predicted_change_pct >= 0 ? '+' : ''}
                {analysis.predicted_change_pct.toFixed(1)}%
              </Text>
            )}
            {analysis.risk_level && (
              <Text style={styles.aiMeta}>리스크 {analysis.risk_level}</Text>
            )}
          </View>
          {analysis.reason && (
            <Text style={styles.aiReason}>{analysis.reason}</Text>
          )}
        </>
      ) : (
        <Text style={styles.aiNote}>
          브리핑 탭에서 AI 분석을 생성하면 상세 전망이 표시됩니다.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  headerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  tickerText: { color: COLORS.text, fontWeight: '800', fontSize: 22 },
  nameText: { color: COLORS.muted, fontSize: 13, marginTop: 2 },
  priceText: { color: COLORS.text, fontWeight: '700', fontSize: 22 },
  changePct: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  profitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
  },
  profitCell: {},
  profitLabel: { color: COLORS.muted, fontSize: 11, marginBottom: 2 },
  profitValue: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  sectionLabel: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  aiCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 4,
  },
  signalBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 10,
  },
  signalText: { fontWeight: '800', fontSize: 16 },
  aiMetaRow: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  aiMeta: { color: COLORS.muted, fontSize: 13 },
  aiReason: { color: COLORS.text, fontSize: 14, lineHeight: 22, opacity: 0.85 },
  aiNote: { color: COLORS.muted, fontSize: 13 },
});
