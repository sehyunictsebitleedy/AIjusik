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
import { LiveStockItem, portfolioApi, stockApi, StockSearchResult, PortfolioCreate, PortfolioUpdate } from '@/services/api';
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
    const doDelete = async () => {
      try {
        await portfolioApi.remove(id);
        load();
      } catch (e: any) {
        Alert.alert('삭제 실패', e.message);
      }
    };

    // Alert.alert은 웹에서 동작 안 할 수 있으므로 confirm 폴백 포함
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`${name}을(를) 삭제하시겠습니까?`)) {
        doDelete();
      }
    } else {
      Alert.alert('종목 삭제', `${name}을(를) 삭제하시겠습니까?`, [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: doDelete },
      ]);
    }
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
            <View style={styles.summaryHeader}>
              <Text style={styles.summaryLabel}>총 평가금액</Text>
              <Text style={styles.closingBadge}>종가 기준</Text>
            </View>
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
  const [form, setForm] = useState<PortfolioCreate>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [tickerInput, setTickerInput] = useState('');
  const [validated, setValidated] = useState<StockSearchResult | null>(null);
  const [validateError, setValidateError] = useState('');

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setTickerInput('');
    setValidated(null);
    setValidateError('');
    onClose();
  };

  const handleMarketChange = (m: 'KR' | 'US') => {
    setForm({ ...EMPTY_FORM, market: m });
    setTickerInput('');
    setValidated(null);
    setValidateError('');
  };

  const handleValidate = async () => {
    const ticker = tickerInput.trim().toUpperCase();
    if (!ticker) return;
    setValidating(true);
    setValidated(null);
    setValidateError('');
    try {
      const result = await stockApi.validate(form.market, ticker);
      setValidated(result);
      setForm((f) => ({ ...f, ticker: result.ticker, name: result.name }));
    } catch {
      setValidateError('종목을 찾을 수 없습니다. 티커를 확인하세요.');
    } finally {
      setValidating(false);
    }
  };

  const submit = async () => {
    if (!validated) return Alert.alert('입력 오류', '티커 확인 버튼을 먼저 눌러주세요.');
    if (form.buy_price <= 0) return Alert.alert('입력 오류', '매입가를 입력하세요.');
    if (form.quantity <= 0) return Alert.alert('입력 오류', '수량을 입력하세요.');

    setLoading(true);
    try {
      await portfolioApi.add(form);
      handleClose();
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
                onPress={() => handleMarketChange(m)}
              >
                <Text style={[styles.marketBtnText, form.market === m && { color: COLORS.text }]}>
                  {m === 'KR' ? '🇰🇷 한국' : '🇺🇸 미국'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 티커 입력 + 확인 */}
          <Text style={styles.inputLabel}>
            {form.market === 'KR' ? '종목 코드 (예: 005930)' : '티커 (예: AAPL)'}
          </Text>
          <View style={styles.tickerRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder={form.market === 'KR' ? '005930' : 'AAPL'}
              placeholderTextColor={COLORS.muted}
              value={tickerInput}
              onChangeText={(v) => {
                setTickerInput(v);
                setValidated(null);
                setValidateError('');
              }}
              autoCapitalize="characters"
              onSubmitEditing={handleValidate}
            />
            <TouchableOpacity
              style={[styles.validateBtn, validating && { opacity: 0.6 }]}
              onPress={handleValidate}
              disabled={validating || !tickerInput.trim()}
            >
              {validating
                ? <ActivityIndicator size="small" color={COLORS.text} />
                : <Text style={styles.validateBtnText}>확인</Text>}
            </TouchableOpacity>
          </View>

          {/* 확인 결과 */}
          {validated && (
            <View style={styles.selectedBadge}>
              <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
              <Text style={styles.selectedText}>{validated.ticker} — {validated.name}</Text>
            </View>
          )}
          {validateError ? (
            <Text style={styles.validateError}>{validateError}</Text>
          ) : null}

          {/* 매입가 / 수량 */}
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
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  summaryLabel: { color: COLORS.muted, fontSize: 12 },
  closingBadge: { color: COLORS.muted, fontSize: 11, backgroundColor: COLORS.border, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
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
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.bg, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 11,
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 15 },
  dropdown: {
    backgroundColor: COLORS.bg, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.border,
    marginTop: 4, maxHeight: 200,
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  dropdownTicker: { color: COLORS.primary, fontWeight: '700', fontSize: 13, width: 70 },
  dropdownName: { color: COLORS.text, fontSize: 13, flex: 1 },
  selectedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.success + '20', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 6, marginTop: 8,
  },
  selectedText: { color: COLORS.success, fontSize: 13, fontWeight: '600' },
  tickerRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  validateBtn: {
    backgroundColor: COLORS.primary, borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 11,
  },
  validateBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  validateError: { color: COLORS.danger, fontSize: 12, marginTop: 6 },
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
