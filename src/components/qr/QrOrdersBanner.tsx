import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BellRing } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { Card, Empty, LinkButton, Notice, PrimaryButton, Sheet, TextField } from '@/components/kitchen/ui';
import { getElapsedLabel } from '@/components/orders/OrderCard';
import { semantic } from '@/lib/pos/brand';
import { acceptQrOrder, declineQrOrder, type QrPendingOrder } from '@/lib/pos/qr-orders-service';
import { priceText } from '@/lib/pos/qr-menu-utils';
import { tableTitle } from '@/lib/pos/qr-table-utils';
import { useOrdersStore } from '@/lib/pos/use-orders-store';
import { useQrOrders } from '@/lib/pos/use-qr-orders';

/**
 * Task 333: when customers have sent table orders, a bar across the top of every till screen says how
 * many wait and opens them. Accept puts the order's items on the table's open order and sends them to
 * the kitchen (the ticket prints with the table); Decline tells the customer, with a reason if given.
 * The bar is not there at all unless the branch takes table orders and one is waiting.
 */
export function QrOrdersBanner({ active, topInset }: { active: boolean; topInset: boolean }) {
  const insets = useSafeAreaInsets();
  const { enabled, orders, refresh } = useQrOrders(active);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Nothing waiting and nothing to say: the sheet closes itself.
  useEffect(() => { if (open && orders.length === 0 && !message && !error) setOpen(false); }, [open, orders.length, message, error]);

  const accept = async (order: QrPendingOrder) => {
    if (busy) return;
    setBusy(order.id);
    setError(null);
    setMessage(null);
    const res = await acceptQrOrder(order.id);
    if (res.data === null) { setBusy(null); setError(res.error); void refresh(); return; }
    // The order is on the table's open order; the till sends it to the kitchen the way it always does.
    const store = useOrdersStore.getState();
    await store.loadOrders();
    const opened = await store.selectOrder(res.data.open_order_id);
    const sent = opened ? await store.saveKot() : false;
    setBusy(null);
    if (sent) setMessage(`${tableTitle(order.table)} sent to the kitchen.`);
    else setError(`${tableTitle(order.table)} is accepted, but the kitchen ticket did not go. Open the table's order and send it.`);
    void refresh();
  };

  const decline = async (order: QrPendingOrder) => {
    if (busy) return;
    setBusy(order.id);
    setError(null);
    setMessage(null);
    const res = await declineQrOrder(order.id, reason);
    setBusy(null);
    if (res.error) { setError(res.error); void refresh(); return; }
    setDeclining(null);
    setReason('');
    setMessage(`${tableTitle(order.table)} declined.`);
    void refresh();
  };

  if (!enabled || (orders.length === 0 && !open)) return null;
  const first = orders[0];
  return (
    <>
      {orders.length > 0 ? (
        <Pressable onPress={() => { setMessage(null); setError(null); setOpen(true); }} accessibilityRole="button"
          accessibilityLabel={`${orders.length} table ${orders.length === 1 ? 'order' : 'orders'} waiting. Review`}
          className="flex-row items-center px-4 hover:opacity-90 active:opacity-80"
          style={{ minHeight: 44, gap: 10, backgroundColor: semantic.warningSoft, paddingTop: topInset ? insets.top : 0, borderBottomWidth: 1, borderBottomColor: semantic.warning }}>
          <BellRing size={18} color={semantic.warning} />
          <Text className="min-w-0 flex-1 text-[14px] font-bold" style={{ color: semantic.warning }} numberOfLines={1}>
            {orders.length === 1 && first ? `${tableTitle(first.table)} is waiting` : `${orders.length} table orders waiting`}
          </Text>
          <Text className="text-[14px] font-bold" style={{ color: semantic.warning }}>Review</Text>
        </Pressable>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title="Table orders">
        <View style={{ gap: 12 }}>
          {message ? <Notice tone="in" text={message} /> : null}
          {error ? <Notice text={error} /> : null}
          {orders.length === 0 ? <Card><Empty title="No table orders waiting" /></Card> : null}
          {orders.map((o) => (
            <Card key={o.id} padded={false} style={{ padding: 14, gap: 10 }}>
              <View className="flex-row items-center justify-between" style={{ gap: 8 }}>
                <View className="min-w-0 flex-1">
                  <Text className="text-[17px] font-bold text-text-primary" numberOfLines={1}>{tableTitle(o.table)}{o.customer_name ? ` · ${o.customer_name}` : ''}</Text>
                  <Text className="text-xs font-semibold text-text-secondary">{getElapsedLabel(o.created_at)} ago</Text>
                </View>
                <Text className="text-[17px] font-bold text-text-primary" style={{ fontVariant: ['tabular-nums'] }}>{priceText(o.total)}</Text>
              </View>
              <View className="rounded-xl bg-surface-tint px-3 py-2" style={{ gap: 3 }}>
                {o.items.map((l) => (
                  <View key={l.product_id} className="flex-row" style={{ gap: 8 }}>
                    <Text className="text-[15px] font-bold text-primary" style={{ minWidth: 28, fontVariant: ['tabular-nums'] }}>{l.qty}×</Text>
                    <Text className="min-w-0 flex-1 text-[15px] font-semibold text-text-primary">{l.name}</Text>
                  </View>
                ))}
              </View>
              {o.note ? <Text className="text-[14px] font-semibold" style={{ color: semantic.warning }}>“{o.note}”</Text> : null}
              {declining === o.id ? (
                <View style={{ gap: 8 }}>
                  <TextField value={reason} onChange={(v) => setReason(v.slice(0, 100))} label="Reason" placeholder="Shown to the customer (optional)" autoFocus />
                  <PrimaryButton label="Decline order" tone="out" onPress={() => void decline(o)} loading={busy === o.id} />
                  <View className="items-center"><LinkButton label="Back" onPress={() => { setDeclining(null); setReason(''); }} /></View>
                </View>
              ) : (
                <View style={{ gap: 2 }}>
                  <PrimaryButton label="Accept and send to the kitchen" onPress={() => void accept(o)} loading={busy === o.id} disabled={!!busy && busy !== o.id} />
                  <View className="items-center"><LinkButton label="Decline" onPress={() => { setDeclining(o.id); setReason(''); }} /></View>
                </View>
              )}
            </Card>
          ))}
        </View>
      </Sheet>
    </>
  );
}
