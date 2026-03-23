import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { LiveStockItem, portfolioApi, PortfolioCreate, PortfolioUpdate } from '@/services/api';
import { COLORS } from '@/constants/config';
import StockCard from '@/components/StockCard';
import { formatReturnPct } from '@/utils/format';

const EMPTY_FORM: PortfolioCreate = {
  ticker: '', name: '', market: 'KR', buy_price: 0, quantity: 0,
};

export default function PortfolioScreen() {
  const [stocks, setStocks] = useState<LiveStockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState<LiveStockItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await portfolioApi.listLive();
      setStocks(data);
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDelete = (id: number, name: string) => {
    Alert.alert('종목 삭제', `${name}을(를) 삭제하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await portfolioApi.remove(id);
            load();
          } catch (e: any) {
            Alert.alert('삭제 실패', e.message);
          }
        },
      },
    ]);
  };

  const handleEdit = (stock: LiveStockItem) => {
    setEditTarget(stock);
  };

  const totalValue = stocks.reduce((s, x) => s + (x.current_value || 0), 0);
  const totalProfit = stocks.reduce((s, x) => s + (x.profit_loss || 0), 0);
  const totalBuy = stocks.reduce((s, x) => s + (x.buy_value || 0), 0);
  const totalReturn = totalBuy ? (totalProfit / totalBuy) * 100 : 0;
  const profitColor = totalProfit >= 0 ? COLORS.up : COLORS.down;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.primary} />
        }
      >
        {/* 총 손익 요약 */}
        {stocks.length > 0 && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>총 평가금액</Text>
            <Text style={styles.summaryValue}>{Math.round(totalValue).toLocaleString()}원</Text>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryProfit, { color: profitColor }]}>
                {totalProfit >= 0 ? '+' : ''}{Math.round(totalProfit).toLocaleString()}원
              </Text>
              <Text style={[styles.summaryPct, { color: profitColor }]}>
                ({formatReturnPct(totalReturn)})
              </Text>
            </View>
          </View>
        )}

        {/* 빈 상태 */}
        {stocks.length === 0 && !loading && (
          <View style={styles.emptyBox}>
            <Ionicons name="bar-chart-outline" size={48} color={COLORS.muted} />
            <Text style={styles.emptyText}>보유 종목이 없습니다</Text>
            <Text style={styles.emptySubText}>아래 + 버튼으로 종목을 추가하세요</Text>
          </View>
        )}

        {/* 종목 카드 목록 — StockCard 컴포넌트 사용 */}
        {stocks.map((stock) => (
          <StockCard
            key={stock.id}
            stock={stock}
            onEdit={() => handleEdit(stock)}
            onDelete={() => handleDelete(stock.id, stock.name)}
          />
        ))}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowAddModal(true)}>
        <Ionicons name="add" size={28} color={COLORS.text} />
      </TouchableOpacity>

      <AddModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdded={() => { setShowAddModal(false); load(); }}
      />

      <EditModal
        stock={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => { setEditTarget(null); load(); }}
      />
    </View>
  );
}

// ────────────────────────────────────────────
// 종목 추가 모달
// ────────────────────────────────────────────

function AddModal({
  visible,
  onClose,
  onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  // 모달이 열릴 때마다 폼 초기화 (버그 수정: 이전 입력값 잔류 방지)
  const [form, setForm] = useState<PortfolioCreate>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    setForm(EMPTY_FORM); // 닫을 때 초기화
    onClose();
  };

  const submit = async () => {
    if (!form.ticker.trim()) return Alert.alert('입력 오류', '티커를 입력하세요.');
    if (!form.name.trim()) return Alert.alert('입력 오류', '종목명을 입력하세요.');
    if (form.buy_price <= 0) return Alert.alert('입력 오류', '매입가를 입력하세요.');
    if (form.quantity <= 0) return Alert.alert('입력 오류', '수량을 입력하세요.');

    setLoading(true);
    try {
      await portfolioApi.add({
        ...form,
        ticker: form.ticker.trim().toUpperCase(),
        name: form.name.trim(),
      });
      setForm(EMPTY_FORM);
      onAdded();
    } catch (e: any) {
      Alert.alert('추가 실패', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.modalBox}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>종목 추가</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={22} color={COLORS.muted} />
            </TouchableOpacity>
          </View>

          {/* 시장 선택 */}
          <Text style={styles.inputLabel}>시장</Text>
          <View style={styles.marketToggle}>
            {(['KR', 'US'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.marketBtn, form.market === m && styles.marketBtnActive]}
                onPress={() => setForm({ ...form, market: m })}
              >
                <Text style={[styles.marketBtnText, form.market === m && { color: COLORS.text }]}>
                  {m === 'KR' ? '🇰🇷 한국' : '🇺🇸 미국'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 티커 */}
          <Text style={styles.inputLabel}>
            티커 {form.market === 'KR' ? '(예: 005930)' : '(예: AAPL)'}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={form.market === 'KR' ? '005930' : 'AAPL'}
            placeholderTextColor={COLORS.muted}
            value={form.ticker}
            onChangeText={(v) => setForm({ ...form, ticker: v })}
            autoCapitalize="characters"
          />

          {/* 종목명 */}
          <Text style={styles.inputLabel}>종목명</Text>
          <TextInput
            style={styles.input}
            placeholder={form.market === 'KR' ? '삼성전자' : 'Apple Inc.'}
            placeholderTextColor={COLORS.muted}
            value={form.name}
            onChangeText={(v) => setForm({ ...form, name: v })}
          />

          {/* 매입가 / 수량 — 나란히 */}
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>매입 평균가</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor={COLORS.muted}
                keyboardType="numeric"
                value={form.buy_price ? String(form.buy_price) : ''}
                onChangeText={(v) => setForm({ ...form, buy_price: parseFloat(v) || 0 })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>수량 (주)</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor={COLORS.muted}
                keyboardType="numeric"
                value={form.quantity ? String(form.quantity) : ''}
                onChangeText={(v) => setForm({ ...form, quantity: parseInt(v, 10) || 0 })}
              />
            </View>
          </View>

          {/* 버튼 */}
          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
              <Text style={styles.cancelBtnText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={loading}>
              {loading
                ? <ActivityIndicator color={COLORS.text} size="small" />
                : <Text style={styles.submitBtnText}>추가하기</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 96 },
  summaryCard: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 16 },
  summaryLabel: { color: COLORS.muted, fontSize: 12, marginBottom: 4 },
  summaryValue: { color: COLORS.text, fontSize: 24, fontWeight: 'bold' },
  summaryRow: { flexDirection: 'row', gap: 6, marginTop: 4, alignItems: 'center' },
  summaryProfit: { fontSize: 15, fontWeight: '600' },
  summaryPct: { fontSize: 14 },
  emptyBox: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyText: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  emptySubText: { color: COLORS.muted, fontSize: 13 },
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    backgroundColor: COLORS.primary, width: 56, height: 56,
    borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 48,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: COLORS.text, fontSize: 20, fontWeight: 'bold' },
  inputLabel: { color: COLORS.muted, fontSize: 12, marginBottom: 5, marginTop: 14 },
  input: {
    backgroundColor: COLORS.bg, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 11,
    color: COLORS.text, fontSize: 15,
    borderWidth: 1, borderColor: COLORS.border,
  },
  row: { flexDirection: 'row', gap: 10 },
  marketToggle: { flexDirection: 'row', gap: 8 },
  marketBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: 8, borderWidth: 1, borderColor: COLORS.border,
  },
  marketBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  marketBtnText: { color: COLORS.muted, fontWeight: '600', fontSize: 14 },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 13,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
  },
  cancelBtnText: { color: COLORS.muted, fontWeight: '600', fontSize: 15 },
  submitBtn: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 10, backgroundColor: COLORS.primary },
  submitBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
});

// ────────────────────────────────────────────
// 종목 수정 모달
// ────────────────────────────────────────────

function EditModal({
  stock,
  onClose,
  onSaved,
}: {
  stock: LiveStockItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [buyPrice, setBuyPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(false);

  // stock이 바뀔 때마다 초기값 세팅
  const prevId = useState<number | null>(null);
  if (stock && stock.id !== prevId[0]) {
    prevId[1](stock.id);
    setBuyPrice(String(stock.buy_price));
    setQuantity(String(stock.quantity));
  }

  const submit = async () => {
    if (!stock) return;
    const bp = parseFloat(buyPrice);
    const qty = parseInt(quantity, 10);
    if (!bp || bp <= 0) return Alert.alert('입력 오류', '매입가를 확인하세요.');
    if (!qty || qty <= 0) return Alert.alert('입력 오류', '수량을 확인하세요.');

    setLoading(true);
    try {
      const update: PortfolioUpdate = {};
      if (bp !== stock.buy_price) update.buy_price = bp;
      if (qty !== stock.quantity) update.quantity = qty;
      await portfolioApi.update(stock.id, update);
      onSaved();
    } catch (e: any) {
      Alert.alert('수정 실패', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={!!stock} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalBox}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{stock?.name} 수정</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={COLORS.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>매입 평균가</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={buyPrice}
                onChangeText={setBuyPrice}
                placeholderTextColor={COLORS.muted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>수량 (주)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={quantity}
                onChangeText={setQuantity}
                placeholderTextColor={COLORS.muted}
              />
            </View>
          </View>

          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={loading}>
              {loading
                ? <ActivityIndicator color={COLORS.text} size="small" />
                : <Text style={styles.submitBtnText}>저장</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
