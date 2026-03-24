import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { briefingApi, BriefingResponse, portfolioApi, PortfolioItem } from '@/services/api';
import { COLORS } from '@/constants/config';
import BriefingItem from '@/components/BriefingItem';

export default function BriefingScreen() {
  const [data, setData] = useState<BriefingResponse | null>(null);
  const [stocks, setStocks] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [briefing, list] = await Promise.all([
        briefingApi.today().catch(() => null),
        portfolioApi.list().catch(() => []),
      ]);
      setData(briefing);
      setStocks(list);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await briefingApi.generate();
      setData(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.primary} />}
    >
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.title}>오늘의 브리핑</Text>
        <Text style={styles.date}>{new Date().toLocaleDateString('ko-KR')}</Text>
      </View>

      {/* 내 보유 종목 */}
      {stocks.length > 0 && (
        <View style={styles.portfolioCard}>
          <Text style={styles.sectionLabel}>💼 내 보유 종목 ({stocks.length}개)</Text>
          <View style={styles.divider} />
          {stocks.map((s) => (
            <View key={s.id} style={styles.stockRow}>
              <View style={styles.stockLeft}>
                <Text style={styles.stockTicker}>{s.ticker}</Text>
                <Text style={styles.stockName} numberOfLines={1}>{s.name}</Text>
              </View>
              <View style={styles.stockRight}>
                <Text style={styles.stockQty}>{s.quantity}주</Text>
                <Text style={styles.stockBuy}>
                  매입 {s.market === 'KR'
                    ? `${Math.round(s.buy_price).toLocaleString()}원`
                    : `$${s.buy_price.toFixed(2)}`}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* 생성 버튼 */}
      <TouchableOpacity
        style={[styles.generateBtn, generating && styles.generateBtnDisabled]}
        onPress={generate}
        disabled={generating}
      >
        {generating ? (
          <ActivityIndicator color={COLORS.text} size="small" />
        ) : (
          <Ionicons name="refresh-outline" size={16} color={COLORS.text} />
        )}
        <Text style={styles.generateBtnText}>
          {generating ? 'AI 분석 중...' : '브리핑 생성'}
        </Text>
      </TouchableOpacity>

      {/* 에러 */}
      {error && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={16} color={COLORS.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* 브리핑 없음 */}
      {!data && !loading && !error && (
        <View style={styles.emptyBox}>
          <Ionicons name="newspaper-outline" size={48} color={COLORS.muted} />
          <Text style={styles.emptyText}>오늘 브리핑이 없습니다</Text>
          <Text style={styles.emptySubText}>위 버튼을 눌러 생성하세요</Text>
        </View>
      )}

      {/* 시장 요약 */}
      {data?.summary && (
        <View style={styles.summaryBox}>
          <Text style={styles.sectionLabel}>📊 시장 요약</Text>
          <Text style={styles.summaryText}>{data.summary}</Text>
        </View>
      )}

      {/* 종목별 분석 */}
      {data?.analyses && data.analyses.length > 0 && (
        <View>
          <Text style={styles.sectionLabel}>종목별 AI 전망</Text>
          {data.analyses.map((item) => (
            <BriefingItem key={item.stock_id} item={item} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 32 },
  header: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: COLORS.text },
  date: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 16,
  },
  generateBtnDisabled: { opacity: 0.6 },
  generateBtnText: { color: COLORS.text, fontWeight: '600', fontSize: 15 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.danger + '22',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { color: COLORS.danger, fontSize: 13, flex: 1 },
  emptyBox: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  emptySubText: { color: COLORS.muted, fontSize: 13 },
  summaryBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryText: { color: COLORS.text, fontSize: 14, lineHeight: 22 },
  portfolioCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  divider: { height: 1, backgroundColor: COLORS.border, marginBottom: 10 },
  stockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  stockLeft: { flex: 1 },
  stockTicker: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  stockName: { color: COLORS.muted, fontSize: 11, marginTop: 1 },
  stockRight: { alignItems: 'flex-end' },
  stockQty: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  stockBuy: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
});
