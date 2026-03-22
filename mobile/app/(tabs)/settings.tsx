import { useCallback, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alertApi, AlertItem, portfolioApi, PortfolioItem } from '@/services/api';
import { COLORS } from '@/constants/config';
import { useFocusEffect } from 'expo-router';

export default function SettingsScreen() {
  const [stocks, setStocks] = useState<PortfolioItem[]>([]);
  const [pendingAlerts, setPendingAlerts] = useState<AlertItem[]>([]);
  const [alertHistory, setAlertHistory] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, pending, history] = await Promise.all([
        portfolioApi.list(),
        alertApi.pending(),
        alertApi.list(),
      ]);
      setStocks(s);
      setPendingAlerts(pending);
      setAlertHistory(history);
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const deleteAlert = async (id: number) => {
    await alertApi.remove(id);
    load();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.primary} />}
    >
      <Text style={styles.pageTitle}>설정</Text>

      {/* 미발송 알람 */}
      <Section title={`미발송 알람 (${pendingAlerts.length})`} icon="notifications-outline">
        {pendingAlerts.length === 0 ? (
          <Text style={styles.emptyText}>미발송 알람 없음</Text>
        ) : (
          pendingAlerts.map((a) => (
            <AlertRow key={a.id} alert={a} onDelete={deleteAlert} />
          ))
        )}
      </Section>

      {/* 종목별 알람 임계값 */}
      <Section title="종목별 알람 임계값" icon="options-outline">
        {stocks.length === 0 ? (
          <Text style={styles.emptyText}>보유 종목이 없습니다</Text>
        ) : (
          stocks.map((stock) => (
            <ThresholdRow key={stock.id} stock={stock} onUpdated={load} />
          ))
        )}
      </Section>

      {/* 알람 이력 */}
      <Section title="알람 이력 (최근 20건)" icon="time-outline">
        {alertHistory.length === 0 ? (
          <Text style={styles.emptyText}>알람 이력 없음</Text>
        ) : (
          alertHistory.slice(0, 20).map((a) => (
            <AlertRow key={a.id} alert={a} onDelete={deleteAlert} showSent />
          ))
        )}
      </Section>

      {/* 앱 정보 */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>AI 개인 투자 어시스턴트</Text>
        <Text style={styles.infoText}>• 이 앱은 투자 권유 서비스가 아닙니다</Text>
        <Text style={styles.infoText}>• AI 분석은 참고 정보 제공 목적입니다</Text>
        <Text style={styles.infoText}>• 미국 주식 데이터는 15분 지연됩니다</Text>
        <Text style={styles.infoText}>• 한국 주식은 장 마감 후 종가 기준입니다</Text>
      </View>
    </ScrollView>
  );
}

// ────────────────────────────────────────────
// 서브 컴포넌트
// ────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon as any} size={16} color={COLORS.muted} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function AlertRow({ alert, onDelete, showSent }: { alert: AlertItem; onDelete: (id: number) => void; showSent?: boolean }) {
  const isAi = alert.alert_type === 'AI_PREDICTION';
  return (
    <View style={styles.alertRow}>
      <View style={[styles.alertDot, { backgroundColor: isAi ? COLORS.warning : COLORS.danger }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.alertMessage} numberOfLines={2}>{alert.message}</Text>
        <Text style={styles.alertMeta}>
          {new Date(alert.triggered_at).toLocaleString('ko-KR')}
          {showSent ? (alert.is_sent ? ' · 발송됨' : ' · 미발송') : ''}
        </Text>
      </View>
      <TouchableOpacity onPress={() => onDelete(alert.id)}>
        <Ionicons name="trash-outline" size={16} color={COLORS.muted} />
      </TouchableOpacity>
    </View>
  );
}

function ThresholdRow({ stock, onUpdated }: { stock: PortfolioItem; onUpdated: () => void }) {
  const levels = [-5, -10, -15, -20];

  const changeThreshold = (value: number) => {
    Alert.alert(
      `${stock.name} 알람 임계값`,
      `${value}% 로 설정하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '확인',
          onPress: async () => {
            await portfolioApi.update(stock.id, { alert_threshold: value });
            onUpdated();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.thresholdRow}>
      <View>
        <Text style={styles.thresholdTicker}>{stock.ticker}</Text>
        <Text style={styles.thresholdName}>{stock.name}</Text>
      </View>
      <View style={styles.thresholdButtons}>
        {levels.map((v) => (
          <TouchableOpacity
            key={v}
            style={[styles.thresholdBtn, stock.alert_threshold === v && styles.thresholdBtnActive]}
            onPress={() => changeThreshold(v)}
          >
            <Text style={[styles.thresholdBtnText, stock.alert_threshold === v && { color: COLORS.text }]}>
              {v}%
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.text, marginBottom: 20 },
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sectionTitle: { color: COLORS.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionBody: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, gap: 10 },
  emptyText: { color: COLORS.muted, fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  alertRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  alertDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  alertMessage: { color: COLORS.text, fontSize: 13, lineHeight: 18 },
  alertMeta: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  thresholdRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  thresholdTicker: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  thresholdName: { color: COLORS.muted, fontSize: 11 },
  thresholdButtons: { flexDirection: 'row', gap: 4 },
  thresholdBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border },
  thresholdBtnActive: { backgroundColor: COLORS.danger, borderColor: COLORS.danger },
  thresholdBtnText: { color: COLORS.muted, fontSize: 11, fontWeight: '600' },
  infoCard: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, gap: 6 },
  infoTitle: { color: COLORS.text, fontWeight: '700', fontSize: 14, marginBottom: 4 },
  infoText: { color: COLORS.muted, fontSize: 13 },
});
