/**
 * StockCard — 포트폴리오 보유 종목 카드
 * portfolio.tsx 에서 재사용
 */
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { LiveStockItem } from '@/services/api';
import { COLORS } from '@/constants/config';
import { MarketBadge, RsiBadge } from '@/components/AlertBadge';
import { formatChangePct, formatProfitLoss, formatReturnPct } from '@/utils/format';

interface Props {
  stock: LiveStockItem;
  onLongPress?: () => void;
}

export default function StockCard({ stock, onLongPress }: Props) {
  const { text: changePctText, isUp } = formatChangePct(stock.change_pct);
  const profitColor = stock.profit_loss >= 0 ? COLORS.up : COLORS.down;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.75}
      onPress={() =>
        router.push({
          pathname: '/stock/[ticker]',
          params: { ticker: stock.ticker, market: stock.market, stockId: String(stock.id) },
        })
      }
      onLongPress={onLongPress}
    >
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
          <Text style={styles.price}>{stock.current_price.toLocaleString()}</Text>
          <Text style={[styles.changePct, { color: isUp ? COLORS.up : COLORS.down }]}>
            {changePctText}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* 하단: 손익 정보 */}
      <View style={styles.bottom}>
        <MetaCell label="수량" value={`${stock.quantity}주`} />
        <MetaCell label="매입가" value={stock.buy_price.toLocaleString()} />
        <MetaCell
          label="손익"
          value={formatProfitLoss(stock.profit_loss, stock.market)}
          color={profitColor}
        />
        <MetaCell
          label="수익률"
          value={formatReturnPct(stock.return_pct)}
          color={profitColor}
        />
      </View>

      {/* RSI 배지 */}
      {stock.rsi != null && (
        <View style={styles.rsiRow}>
          <Text style={styles.rsiText}>RSI {stock.rsi.toFixed(1)}</Text>
          <RsiBadge signal={stock.rsi_signal} />
        </View>
      )}

      {/* 에러 표시 */}
      {stock.error && (
        <Text style={styles.errorText}>⚠ 데이터 조회 실패</Text>
      )}
    </TouchableOpacity>
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
    padding: 14,
    marginBottom: 10,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  tickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  ticker: { color: COLORS.text, fontWeight: '700', fontSize: 17 },
  name: { color: COLORS.muted, fontSize: 12, maxWidth: 160 },
  priceBlock: { alignItems: 'flex-end' },
  price: { color: COLORS.text, fontWeight: '700', fontSize: 17 },
  changePct: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  divider: { height: 1, backgroundColor: COLORS.border, marginBottom: 10 },
  bottom: { flexDirection: 'row', justifyContent: 'space-between' },
  metaLabel: { color: COLORS.muted, fontSize: 11, marginBottom: 2 },
  metaValue: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  rsiRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  rsiText: { color: COLORS.muted, fontSize: 12 },
  errorText: { color: COLORS.warning, fontSize: 12, marginTop: 6 },
});
