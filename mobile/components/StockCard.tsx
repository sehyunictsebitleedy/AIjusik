/**
 * StockCard — 포트폴리오 보유 종목 카드
 * portfolio.tsx 에서 재사용
 */
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LiveStockItem } from '@/services/api';
import { COLORS } from '@/constants/config';
import { MarketBadge, RsiBadge } from '@/components/AlertBadge';
import { formatChangePct, formatProfitLoss, formatReturnPct } from '@/utils/format';

interface Props {
  stock: LiveStockItem;
  onLongPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function StockCard({ stock, onLongPress, onEdit, onDelete }: Props) {
  const { text: changePctText, isUp } = formatChangePct(stock.change_pct);
  const profitColor = stock.profit_loss >= 0 ? COLORS.up : COLORS.down;

  const navigate = () =>
    router.push({
      pathname: '/stock/[ticker]',
      params: { ticker: stock.ticker, market: stock.market, stockId: String(stock.id) },
    });

  return (
    <View style={styles.card}>
      {/* 카드 본문 — 탭하면 상세 이동 */}
      <TouchableOpacity activeOpacity={0.75} onPress={navigate} onLongPress={onLongPress}>
        {/* 상단: 티커 / 현재가 */}
        <View style={styles.top}>
          <View>
            <View style={styles.tickerRow}>
              <Text style={styles.ticker}>{stock.ticker}</Text>
              <MarketBadge market={stock.market} />
            </View>
            <Text style={styles.name} numberOfLines={1}>{stock.name}</Text>
          </View>
          <View style={styles.priceBlock}>
            <Text style={styles.price}>
              {stock.error ? '-' : stock.current_price.toLocaleString()}
            </Text>
            {!stock.error && (
              <Text style={[styles.changePct, { color: isUp ? COLORS.up : COLORS.down }]}>
                {changePctText}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        {/* 하단: 손익 정보 */}
        <View style={styles.bottom}>
          <MetaCell label="수량" value={`${stock.quantity}주`} />
          <MetaCell label="매입가" value={stock.buy_price.toLocaleString()} />
          <MetaCell
            label="손익"
            value={stock.error ? '-' : formatProfitLoss(stock.profit_loss, stock.market)}
            color={stock.error ? COLORS.muted : profitColor}
          />
          <MetaCell
            label="수익률"
            value={stock.error ? '-' : formatReturnPct(stock.return_pct)}
            color={stock.error ? COLORS.muted : profitColor}
          />
        </View>

        {/* RSI 배지 */}
        {stock.rsi != null && !stock.error && (
          <View style={styles.rsiRow}>
            <Text style={styles.rsiText}>RSI {stock.rsi.toFixed(1)}</Text>
            <RsiBadge signal={stock.rsi_signal} />
          </View>
        )}
      </TouchableOpacity>

      {/* 액션 버튼 — 카드 탭 영역 밖에 배치 */}
      {(onEdit || onDelete) && (
        <View style={styles.actionRow}>
          {onEdit && (
            <Pressable style={styles.actionBtn} onPress={onEdit} hitSlop={10}>
              <Ionicons name="create-outline" size={17} color={COLORS.muted} />
              <Text style={styles.actionText}>수정</Text>
            </Pressable>
          )}
          {onEdit && onDelete && <View style={styles.actionDivider} />}
          {onDelete && (
            <Pressable style={styles.actionBtn} onPress={onDelete} hitSlop={10}>
              <Ionicons name="trash-outline" size={17} color={COLORS.danger} />
              <Text style={[styles.actionText, { color: COLORS.danger }]}>삭제</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function MetaCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 14,
    paddingBottom: 0,
  },
  tickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  ticker: { color: COLORS.text, fontWeight: '700', fontSize: 17 },
  name: { color: COLORS.muted, fontSize: 12, maxWidth: 160 },
  priceBlock: { alignItems: 'flex-end' },
  price: { color: COLORS.text, fontWeight: '700', fontSize: 17 },
  changePct: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  divider: { height: 1, backgroundColor: COLORS.border, marginTop: 10, marginHorizontal: 14 },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  metaLabel: { color: COLORS.muted, fontSize: 11, marginBottom: 2 },
  metaValue: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  rsiRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 10 },
  rsiText: { color: COLORS.muted, fontSize: 12 },
  actionRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
  },
  actionText: { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  actionDivider: { width: 1, backgroundColor: COLORS.border },
});
