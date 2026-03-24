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
import { recommendApi, RecommendItem, RecommendResponse } from '@/services/api';
import { COLORS } from '@/constants/config';
import { useFocusEffect } from 'expo-router';

type MarketFilter = 'ALL' | 'KR' | 'US';

export default function RecommendScreen() {
  const [krData, setKrData] = useState<RecommendResponse | null>(null);
  const [usData, setUsData] = useState<RecommendResponse | null>(null);
  const [market, setMarket] = useState<MarketFilter>('ALL');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (m: MarketFilter) => {
    setLoading(true);
    setError(null);
    try {
      if (m === 'ALL') {
        const [kr, us] = await Promise.all([recommendApi.get('KR'), recommendApi.get('US')]);
        setKrData(kr);
        setUsData(us);
      } else if (m === 'KR') {
        setKrData(await recommendApi.get('KR'));
      } else {
        setUsData(await recommendApi.get('US'));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(market); }, [market]));

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      if (market === 'ALL') {
        const [kr, us] = await Promise.all([recommendApi.generate('KR'), recommendApi.generate('US')]);
        setKrData(kr);
        setUsData(us);
      } else if (market === 'KR') {
        setKrData(await recommendApi.generate('KR'));
      } else {
        setUsData(await recommendApi.generate('US'));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const switchMarket = (m: MarketFilter) => {
    setMarket(m);
    load(m);
  };

  const showKr = market === 'ALL' || market === 'KR';
  const showUs = market === 'ALL' || market === 'US';
  const hasData = (showKr && (krData?.items.length ?? 0) > 0) || (showUs && (usData?.items.length ?? 0) > 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(market)} tintColor={COLORS.primary} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>추천 종목</Text>
        <Text style={styles.date}>{new Date().toLocaleDateString('ko-KR')} 기준</Text>
      </View>

      {/* 시장 탭 */}
      <View style={styles.filterRow}>
        {(['ALL', 'KR', 'US'] as MarketFilter[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.filterBtn, market === m && styles.filterBtnActive]}
            onPress={() => switchMarket(m)}
          >
            <Text style={[styles.filterBtnText, market === m && styles.filterBtnTextActive]}>
              {m === 'ALL' ? '전체' : m === 'KR' ? '🇰🇷 한국' : '🇺🇸 미국'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 재생성 버튼 */}
      <TouchableOpacity
        style={[styles.generateBtn, generating && styles.generateBtnDisabled]}
        onPress={generate}
        disabled={generating}
      >
        {generating ? (
          <ActivityIndicator color={COLORS.text} size="small" />
        ) : (
          <Ionicons name="sparkles-outline" size={16} color={COLORS.text} />
        )}
        <Text style={styles.generateBtnText}>
          {generating ? 'AI 분석 중...' : 'AI 추천 새로 받기'}
        </Text>
      </TouchableOpacity>

      {error && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={16} color={COLORS.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!hasData && !loading && !error && (
        <View style={styles.emptyBox}>
          <Ionicons name="star-outline" size={48} color={COLORS.muted} />
          <Text style={styles.emptyText}>추천 종목이 없습니다</Text>
          <Text style={styles.emptySubText}>위 버튼을 눌러 AI 추천을 받으세요</Text>
        </View>
      )}

      {/* 한국 섹션 */}
      {showKr && (krData?.items.length ?? 0) > 0 && (
        <View>
          {market === 'ALL' && <Text style={styles.sectionHeader}>🇰🇷 한국 추천 5종목</Text>}
          {krData!.items.map((item, idx) => (
            <RecommendCard key={`kr-${item.ticker}-${idx}`} item={item} rank={idx + 1} />
          ))}
        </View>
      )}

      {/* 미국 섹션 */}
      {showUs && (usData?.items.length ?? 0) > 0 && (
        <View>
          {market === 'ALL' && <Text style={[styles.sectionHeader, { marginTop: 8 }]}>🇺🇸 미국 추천 5종목</Text>}
          {usData!.items.map((item, idx) => (
            <RecommendCard key={`us-${item.ticker}-${idx}`} item={item} rank={idx + 1} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function RecommendCard({ item, rank }: { item: RecommendItem; rank: number }) {
  const isUp = item.direction === 'UP';
  const dirColor = isUp ? COLORS.up : COLORS.down;
  const dirIcon = isUp ? '▲' : '▼';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>{rank}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.tickerRow}>
            <Text style={styles.ticker}>{item.ticker}</Text>
            <Text style={styles.marketBadge}>{item.market}</Text>
            <Text style={[styles.direction, { color: dirColor }]}>{dirIcon}</Text>
          </View>
          <Text style={styles.name}>{item.name}</Text>
        </View>
      </View>
      <Text style={styles.reason}>{item.reason}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 32 },
  header: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: COLORS.text },
  date: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  filterBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterBtnText: { color: COLORS.muted, fontWeight: '600' },
  filterBtnTextActive: { color: COLORS.text },
  generateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.surface, borderRadius: 10, paddingVertical: 12, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  generateBtnDisabled: { opacity: 0.6 },
  generateBtnText: { color: COLORS.text, fontWeight: '600', fontSize: 15 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.danger + '22', borderRadius: 8, padding: 12, marginBottom: 12 },
  errorText: { color: COLORS.danger, fontSize: 13, flex: 1 },
  emptyBox: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  emptySubText: { color: COLORS.muted, fontSize: 13 },
  card: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  rankBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary + '33', alignItems: 'center', justifyContent: 'center' },
  rankText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  tickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ticker: { color: COLORS.text, fontWeight: '700', fontSize: 16 },
  marketBadge: { backgroundColor: COLORS.border, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, color: COLORS.muted, fontSize: 11 },
  direction: { fontWeight: '700', fontSize: 15 },
  name: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  reason: { color: COLORS.text, fontSize: 13, lineHeight: 20, opacity: 0.85 },
  sectionHeader: { color: COLORS.muted, fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
});
