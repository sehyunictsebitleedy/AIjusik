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
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  BriefingAnalysis,
  SellTarget,
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

const VERDICT: Record<string, { label: string; emoji: string; color: string }> = {
  BUY:  { label: '추가매수 추천', emoji: '🟢', color: COLORS.success },
  HOLD: { label: '보유 유지',     emoji: '🟡', color: COLORS.warning },
  SELL: { label: '위험 · 매도 고려', emoji: '🔴', color: COLORS.danger },
};
const RISK_META: Record<string, { label: string; color: string }> = {
  HIGH:   { label: '변동 위험 높음', color: COLORS.danger },
  MEDIUM: { label: '변동 주의',      color: COLORS.warning },
  LOW:    { label: '안정적',         color: COLORS.success },
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

  const [analyzing, setAnalyzing] = useState(false);

  const runAnalysis = useCallback(async () => {
    if (!stockId) return;
    setAnalyzing(true);
    try {
      const result = await briefingApi.analyzeStock(Number(stockId));
      setAnalysis(result);
    } catch (e: any) {
      Alert.alert('분석 실패', e.message ?? '잠시 후 다시 시도해주세요.');
    } finally {
      setAnalyzing(false);
    }
  }, [stockId]);

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
      <AiSignalCard
        analysis={analysis}
        liveData={liveData}
        onAnalyze={stockId ? runAnalysis : undefined}
        analyzing={analyzing}
      />
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
  onAnalyze,
  analyzing,
}: {
  analysis: BriefingAnalysis | null;
  liveData: LiveStockItem | null;
  onAnalyze?: () => void;
  analyzing?: boolean;
}) {
  if (!analysis) {
    return (
      <View style={styles.aiCard}>
        <Text style={styles.sectionLabel}>AI 전망</Text>
        <Text style={styles.aiNote}>아직 분석 결과가 없습니다.</Text>
        {onAnalyze && (
          <TouchableOpacity
            style={styles.analyzeBtn}
            onPress={onAnalyze}
            disabled={analyzing}
          >
            {analyzing
              ? <ActivityIndicator color={COLORS.text} size="small" />
              : <Text style={styles.analyzeBtnText}>🤖 AI 분석 시작</Text>}
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const verdict = VERDICT[analysis.signal] ?? VERDICT.HOLD;
  const risk = analysis.risk_level ? RISK_META[analysis.risk_level] : null;
  const isUp = (analysis.predicted_change_pct ?? 0) >= 0;

  return (
    <View style={[styles.aiCard, { borderLeftColor: verdict.color }]}>
      <View style={styles.aiCardHeader}>
        <Text style={styles.sectionLabel}>AI 전망</Text>
        {onAnalyze && (
          <TouchableOpacity onPress={onAnalyze} disabled={analyzing} style={styles.reAnalyzeBtn}>
            {analyzing
              ? <ActivityIndicator size="small" color={COLORS.primary} />
              : <Text style={styles.reAnalyzeText}>재분석</Text>}
          </TouchableOpacity>
        )}
      </View>

      {/* 판정 배너 */}
      <View style={[styles.verdictBanner, { backgroundColor: verdict.color + '22' }]}>
        <Text style={[styles.verdictText, { color: verdict.color }]}>
          {verdict.emoji}  {verdict.label}
        </Text>
        {analysis.predicted_change_pct != null && (
          <Text style={[styles.predictText, { color: isUp ? COLORS.up : COLORS.down }]}>
            예측 {isUp ? '+' : ''}{analysis.predicted_change_pct.toFixed(1)}%
          </Text>
        )}
      </View>

      {/* 메타 칩 */}
      <View style={styles.aiMetaRow}>
        {risk && (
          <View style={styles.metaChip}>
            <Text style={[styles.metaChipText, { color: risk.color }]}>{risk.label}</Text>
          </View>
        )}
        {analysis.rsi_value != null && (
          <View style={styles.metaChip}>
            <Text style={styles.metaChipText}>RSI {analysis.rsi_value.toFixed(1)}</Text>
          </View>
        )}
      </View>

      {/* 변동성 요약 */}
      {analysis.volatility && (
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>📊 변동성 전망</Text>
          <Text style={styles.infoText}>{analysis.volatility}</Text>
        </View>
      )}

      {/* 핵심 요인 */}
      {analysis.key_factors?.length > 0 && (
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>🔑 핵심 영향 요인</Text>
          {analysis.key_factors.map((f, i) => (
            <Text key={i} style={styles.factorItem}>• {f}</Text>
          ))}
        </View>
      )}

      {/* 목표 매도가 */}
      {analysis.sell_target && (
        <SellTargetCard target={analysis.sell_target} market={analysis.market as Market} />
      )}

      {/* AI 근거 */}
      {analysis.reason && (
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>🤖 AI 분석 근거</Text>
          <Text style={styles.aiReason}>{analysis.reason}</Text>
        </View>
      )}
    </View>
  );
}

function SellTargetCard({ target, market }: { target: SellTarget; market: Market }) {
  const priceStr = market === 'KR'
    ? `${Math.round(target.price).toLocaleString()}원`
    : `$${target.price.toFixed(2)}`;

  return (
    <View style={styles.sellTargetCard}>
      <View style={styles.sellTargetHeader}>
        <Text style={styles.sellTargetLabel}>💰 매도 목표가</Text>
        <Text style={styles.sellTargetHorizon}>{target.horizon}</Text>
      </View>
      <Text style={styles.sellTargetPrice}>{priceStr}</Text>
      <Text style={styles.sellTargetReason}>{target.reason}</Text>
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
  verdictBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
  },
  verdictText: { fontSize: 15, fontWeight: '700' },
  predictText: { fontSize: 13, fontWeight: '600' },
  volatilityBox: {
    backgroundColor: COLORS.bg, borderRadius: 8,
    padding: 10, marginBottom: 10,
  },
  volatilityLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  volatilityText: { color: COLORS.text, fontSize: 13, lineHeight: 19 },
  aiMetaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  metaChip: { backgroundColor: COLORS.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  metaChipText: { color: COLORS.muted, fontSize: 12, fontWeight: '600' },
  infoBox: { backgroundColor: COLORS.bg, borderRadius: 8, padding: 12, marginBottom: 10 },
  infoLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '700', marginBottom: 6 },
  infoText: { color: COLORS.text, fontSize: 13, lineHeight: 20 },
  factorItem: { color: COLORS.text, fontSize: 13, lineHeight: 22, opacity: 0.85 },
  sellTargetCard: {
    backgroundColor: COLORS.warning + '15',
    borderRadius: 10, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.warning + '40',
  },
  sellTargetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sellTargetLabel: { color: COLORS.warning, fontSize: 12, fontWeight: '700' },
  sellTargetHorizon: { color: COLORS.muted, fontSize: 11, backgroundColor: COLORS.border, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  sellTargetPrice: { color: COLORS.text, fontSize: 24, fontWeight: '800', marginBottom: 6 },
  sellTargetReason: { color: COLORS.text, fontSize: 13, lineHeight: 19, opacity: 0.8 },
  aiReason: { color: COLORS.text, fontSize: 13, lineHeight: 21, opacity: 0.9 },
  aiNote: { color: COLORS.muted, fontSize: 13, marginBottom: 14 },
  aiCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  analyzeBtn: {
    backgroundColor: COLORS.primary, borderRadius: 8,
    paddingVertical: 12, alignItems: 'center', marginTop: 12,
  },
  analyzeBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  reAnalyzeBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: COLORS.primary + '30' },
  reAnalyzeText: { color: COLORS.primary, fontSize: 12, fontWeight: '600' },
});
