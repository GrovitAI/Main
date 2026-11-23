import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, View } from 'react-native';
import { Check, ChevronLeft, Minus, Plus, Search, X } from 'lucide-react-native';
import { Text, TextInput } from '@/components/ui/Typography';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { colors, semantic } from '@/lib/pos/brand';
import { fetchQrMenu, fetchQrOrderStatus, placeQrOrder, type QrFailure } from '@/lib/pos/qr-menu-service';
import {
  cartLines, cartTotals, changeQty, menuSections, newOrderKey, orderLines, priceText,
  type QrCart, type QrMenu, type QrMenuItem, type QrOrderState,
} from '@/lib/pos/qr-menu-utils';

const badge = require('../../../assets/images/le-laban-badge.png');

/** Said for each way a call can fail; the server never sends text of its own. */
const FAILURE: Record<QrFailure, { title: string; body: string }> = {
  closed: { title: 'Ordering is off', body: 'Please ask the team at the counter.' },
  busy: { title: 'Too many orders at once', body: 'Wait a minute and try again, or ask the team.' },
  item_gone: { title: 'Something is no longer available', body: 'The menu has been refreshed. Check your order.' },
  invalid: { title: 'That order could not be sent', body: 'Check it and try again.' },
  offline: { title: 'No connection', body: 'Check your internet and try again.' },
  unavailable: { title: 'Something went wrong', body: 'Please try again.' },
};

type Load = { state: 'loading' } | { state: 'error'; kind: QrFailure } | { state: 'ready'; menu: QrMenu };
type Placed = { id: string; at: number };
type Step = 'menu' | 'review' | 'status';
const WINDOW_MS = 3 * 60 * 60 * 1000;
const tabular = { fontVariant: ['tabular-nums' as const] };

function saved(code: string): Placed | null {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage?.getItem(`qr-order:${code}`) : null;
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (typeof v === 'object' && v !== null && 'id' in v && 'at' in v) {
      const { id, at } = v as { id: unknown; at: unknown };
      if (typeof id === 'string' && typeof at === 'number' && Date.now() - at < WINDOW_MS) return { id, at };
    }
  } catch { /* storage unavailable */ }
  return null;
}
function remember(code: string, placed: Placed | null): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (placed) window.localStorage.setItem(`qr-order:${code}`, JSON.stringify(placed)); else window.localStorage.removeItem(`qr-order:${code}`);
  } catch { /* storage unavailable */ }
}

/**
 * Task 331: the page a table's QR code opens. The customer picks items, reviews the order and sends it;
 * staff accept it at the till, and the page shows where it stands. Nothing is signed in and nothing is
 * paid here: the customer pays at the counter. Phone first; on a wide screen it is one centred column.
 */
export function QrMenuPage({ code }: { code: string }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [cart, setCart] = useState<QrCart>({});
  const [step, setStep] = useState<Step>('menu');
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<QrFailure | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [state, setState] = useState<QrOrderState | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const key = useRef(newOrderKey());

  const loadMenu = useCallback(async (keepCart: boolean) => {
    if (!keepCart) setLoad({ state: 'loading' });
    const res = await fetchQrMenu(code);
    if (res.error) {
      setLoad((was) => (was.state === 'ready' && keepCart ? was : { state: 'error', kind: res.error }));
      return;
    }
    const menu = res.data;
    setLoad({ state: 'ready', menu });
    // Whatever left the menu leaves the order too.
    setCart((was) => Object.fromEntries(Object.entries(was).filter(([id]) => menu.items.some((i) => i.id === id))));
  }, [code]);

  useEffect(() => {
    void loadMenu(false);
    const before = saved(code);
    if (before) { setPlaced(before); setStep('status'); }
  }, [code, loadMenu]);

  // Where the order stands, until the team answers.
  useEffect(() => {
    if (step !== 'status' || !placed || (state !== null && state !== 'pending')) return;
    let live = true;
    const check = async () => {
      const res = await fetchQrOrderStatus(code, placed.id);
      if (!live) return;
      if (res.error === 'closed') { setState('expired'); return; }
      if (!res.error) { setState(res.data.status); setReason(res.data.reason); }
    };
    void check();
    const timer = setInterval(() => void check(), 4000);
    return () => { live = false; clearInterval(timer); };
  }, [step, placed, state, code]);

  const menu = load.state === 'ready' ? load.menu : null;
  const totals = menu ? cartTotals(menu, cart) : { count: 0, total: 0 };
  const sections = useMemo(() => (menu ? menuSections(menu, query) : []), [menu, query]);
  const rows = useMemo(() => sections.flatMap((s) => [{ kind: 'head' as const, id: `h-${s.id}`, title: s.title }, ...s.items.map((item) => ({ kind: 'item' as const, id: item.id, item }))]), [sections]);

  const send = async () => {
    if (!menu || sending || totals.count === 0) return;
    setSending(true);
    setProblem(null);
    const res = await placeQrOrder({ code, key: key.current, items: orderLines(menu, cart), name, note });
    setSending(false);
    if (res.error) {
      setProblem(res.error);
      if (res.error === 'item_gone') { key.current = newOrderKey(); void loadMenu(true); }
      return;
    }
    const p = { id: res.data.id, at: Date.now() };
    remember(code, p);
    setPlaced(p);
    setState('pending');
    setReason(null);
    setCart({});
    setNote('');
    key.current = newOrderKey();
    setStep('status');
  };

  const orderMore = () => {
    remember(code, null);
    setPlaced(null);
    setState(null);
    setReason(null);
    setStep('menu');
  };

  const shell = (children: React.ReactNode) => (
    <View className="flex-1 bg-kitchen-canvas">
      <View className="w-full flex-1 self-center" style={{ maxWidth: 560 }}>{children}</View>
    </View>
  );

  const head = (
    <View className="flex-row items-center border-b border-border-soft bg-white px-4" style={{ minHeight: 64, gap: 12 }}>
      <Image source={badge} style={{ width: 40, height: 40, borderRadius: 10 }} accessibilityLabel="Le Laban" />
      <View className="min-w-0 flex-1">
        <Text className="text-[17px] font-bold text-text-primary" numberOfLines={1}>Le Laban</Text>
        <Text className="text-[13px] font-semibold text-text-secondary" numberOfLines={1}>{menu?.branch ?? ' '}</Text>
      </View>
      {menu ? (
        <View className="rounded-full bg-surface-tint px-3.5" style={{ height: 32, justifyContent: 'center' }}>
          <Text className="text-[13px] font-bold text-primary" numberOfLines={1}>Table {menu.table}</Text>
        </View>
      ) : null}
    </View>
  );

  if (load.state === 'loading') {
    return shell(<>{head}<View className="flex-1 items-center justify-center"><ActivityIndicator color={colors.primary} accessibilityLabel="Loading the menu" /></View></>);
  }
  if (load.state === 'error') {
    const f = FAILURE[load.kind];
    return shell(
      <>
        {head}
        <View className="flex-1 items-center justify-center px-8" style={{ gap: 6 }}>
          <Text className="text-center text-lg font-bold text-text-primary">{f.title}</Text>
          <Text className="text-center text-[15px] text-text-secondary">{f.body}</Text>
          {load.kind === 'closed' ? null : <TextLink label="Try again" onPress={() => void loadMenu(false)} />}
        </View>
      </>,
    );
  }

  if (step === 'status' && placed) {
    const done = state === 'accepted';
    const closed = state === 'declined' || state === 'expired';
    return shell(
      <>
        {head}
        <View className="flex-1 items-center justify-center px-8" style={{ gap: 10 }}>
          <View className="items-center justify-center rounded-full" style={{ width: 64, height: 64, backgroundColor: done ? semantic.successSoft : closed ? semantic.dangerSoft : colors.surfaceTint }}>
            {done ? <Check size={30} color={semantic.success} strokeWidth={3} /> : closed ? <X size={30} color={semantic.danger} strokeWidth={3} /> : <ActivityIndicator color={colors.primary} />}
          </View>
          <Text className="text-center text-xl font-bold text-text-primary">
            {done ? 'Order confirmed' : state === 'declined' ? 'Order not accepted' : state === 'expired' ? 'Not confirmed' : 'Order sent'}
          </Text>
          <Text className="text-center text-[15px] text-text-secondary">
            {done ? 'The kitchen has your order. You pay at the counter.'
              : state === 'declined' ? reason ?? 'Please ask the team at the counter.'
              : state === 'expired' ? 'Please ask the team at the counter.'
              : 'Waiting for the team to confirm it.'}
          </Text>
          <View className="mt-3 w-full items-center">
            <TextLink label={closed ? 'Back to the menu' : 'Order more'} onPress={orderMore} />
          </View>
        </View>
      </>,
    );
  }

  if (step === 'review' && menu) {
    const lines = cartLines(menu, cart);
    return shell(
      <KeyboardAvoider>
        <View className="flex-row items-center border-b border-border-soft bg-white px-2" style={{ minHeight: 56 }}>
          <Pressable onPress={() => setStep('menu')} accessibilityRole="button" accessibilityLabel="Back to the menu" className="h-11 w-11 items-center justify-center rounded-xl hover:bg-surface-tint active:bg-surface-tint">
            <ChevronLeft size={22} color={colors.primary} />
          </Pressable>
          <Text className="ml-1 text-[17px] font-bold text-text-primary">Your order · Table {menu.table}</Text>
        </View>
        <FlatList
          data={lines}
          keyExtractor={(l) => l.item.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          ListEmptyComponent={<Text className="py-8 text-center text-[15px] text-text-secondary">Nothing added yet.</Text>}
          renderItem={({ item: l }) => (
            <View className="flex-row items-center rounded-2xl bg-white px-4 py-2.5" style={{ gap: 12, minHeight: 60 }}>
              <View className="min-w-0 flex-1">
                <Text className="text-[16px] font-semibold text-text-primary" numberOfLines={2}>{l.item.name}</Text>
                <Text className="text-[13px] font-semibold text-text-secondary" style={tabular}>{priceText(l.amount)}</Text>
              </View>
              <Stepper qty={l.qty} name={l.item.name} onChange={(by) => setCart((c) => changeQty(c, l.item.id, by))} />
            </View>
          )}
          ListFooterComponent={
            <View style={{ gap: 12, marginTop: 4 }}>
              <Field label="Your name" value={name} onChange={setName} placeholder="Optional" max={60} />
              <Field label="Note for the kitchen" value={note} onChange={setNote} placeholder="Optional" max={200} multiline />
              {problem ? <Text className="px-1 text-[14px] font-semibold" style={{ color: semantic.danger }}>{FAILURE[problem].title}. {FAILURE[problem].body}</Text> : null}
            </View>
          }
        />
        <View className="border-t border-border-soft bg-white px-4 pb-4 pt-3" style={{ gap: 8 }}>
          <Pressable onPress={() => void send()} disabled={sending || totals.count === 0} accessibilityRole="button" accessibilityLabel="Send the order"
            className="flex-row items-center justify-center rounded-2xl bg-primary hover:bg-primary-deep active:bg-primary-deep" style={{ height: 52, gap: 8, opacity: totals.count === 0 ? 0.5 : 1 }}>
            {sending ? <ActivityIndicator color={colors.textOnPrimary} /> : null}
            <Text className="text-[16px] font-bold text-text-on-primary" style={tabular}>Send order · {priceText(totals.total)}</Text>
          </Pressable>
          <Text className="text-center text-[13px] font-semibold text-text-secondary">You pay at the counter</Text>
        </View>
      </KeyboardAvoider>,
    );
  }

  return shell(
    <>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[0]}
        ListHeaderComponent={
          <View className="bg-kitchen-canvas">
            {head}
            <View className="px-4 pb-2 pt-3">
              <View className="flex-row items-center rounded-2xl border border-border-soft bg-white px-3" style={{ height: 48, gap: 8 }}>
                <Search size={18} color={colors.textSecondary} />
                <TextInput value={query} onChangeText={setQuery} placeholder="Search the menu" placeholderTextColor={colors.textSecondary} accessibilityLabel="Search the menu"
                  className="min-w-0 flex-1 text-[16px] text-text-primary" style={{ height: 46 }} />
                {query ? (
                  <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear the search" className="h-9 w-9 items-center justify-center rounded-full hover:bg-surface-tint">
                    <X size={16} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={<Text className="px-4 py-10 text-center text-[15px] text-text-secondary">{query ? 'Nothing matches that.' : 'The menu is empty right now.'}</Text>}
        contentContainerStyle={{ paddingBottom: totals.count > 0 ? 96 : 24 }}
        renderItem={({ item: r }) => r.kind === 'head' ? (
          <Text className="px-4 pb-1.5 pt-4 text-[13px] font-bold uppercase text-text-secondary" style={{ letterSpacing: 0.6 }}>{r.title}</Text>
        ) : (
          <ItemRow item={r.item} qty={cart[r.item.id] ?? 0} onChange={(by) => setCart((c) => changeQty(c, r.item.id, by))} />
        )}
      />
      {totals.count > 0 ? (
        <View className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-2" style={{ backgroundColor: colors.kitchenCanvas }}>
          <Pressable onPress={() => { setProblem(null); setStep('review'); }} accessibilityRole="button" accessibilityLabel="View your order"
            className="flex-row items-center justify-between rounded-2xl bg-primary px-5 hover:bg-primary-deep active:bg-primary-deep" style={{ height: 52 }}>
            <Text className="text-[16px] font-bold text-text-on-primary">View order · {totals.count} {totals.count === 1 ? 'item' : 'items'}</Text>
            <Text className="text-[16px] font-bold text-text-on-primary" style={tabular}>{priceText(totals.total)}</Text>
          </Pressable>
        </View>
      ) : null}
    </>,
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" className="min-h-11 items-center justify-center rounded-xl px-4 hover:bg-surface-tint active:bg-surface-tint">
      <Text className="text-[16px] font-bold text-primary">{label}</Text>
    </Pressable>
  );
}

/** A row of the menu: the whole row adds one; once added it carries a stepper. */
function ItemRow({ item, qty, onChange }: { item: QrMenuItem; qty: number; onChange: (by: number) => void }) {
  return (
    <Pressable onPress={() => onChange(1)} accessibilityRole="button" accessibilityLabel={`Add ${item.name}, ${priceText(item.price)}`}
      className="mx-4 mb-2 flex-row items-center rounded-2xl bg-white px-4 hover:bg-surface-tint active:bg-surface-tint" style={{ minHeight: 60, gap: 12, borderWidth: qty > 0 ? 1.5 : 0, borderColor: colors.primary }}>
      <View className="min-w-0 flex-1 py-2.5">
        <Text className="text-[16px] font-semibold text-text-primary" numberOfLines={2}>{item.name}</Text>
        <Text className="text-[14px] font-semibold text-text-secondary" style={tabular}>{priceText(item.price)}</Text>
      </View>
      {qty > 0 ? <Stepper qty={qty} name={item.name} onChange={onChange} /> : (
        <View className="items-center justify-center rounded-full bg-surface-tint" style={{ width: 36, height: 36 }}><Plus size={18} color={colors.primary} strokeWidth={2.6} /></View>
      )}
    </Pressable>
  );
}

function Stepper({ qty, name, onChange }: { qty: number; name: string; onChange: (by: number) => void }) {
  return (
    <View className="flex-row items-center rounded-full bg-surface-tint" style={{ height: 40 }}>
      <Pressable onPress={() => onChange(-1)} accessibilityRole="button" accessibilityLabel={`One less ${name}`} className="h-11 w-11 items-center justify-center rounded-full hover:bg-white active:bg-white">
        <Minus size={18} color={colors.primary} strokeWidth={2.6} />
      </Pressable>
      <Text className="text-center text-[16px] font-bold text-text-primary" style={{ minWidth: 24, ...tabular }}>{qty}</Text>
      <Pressable onPress={() => onChange(1)} accessibilityRole="button" accessibilityLabel={`One more ${name}`} className="h-11 w-11 items-center justify-center rounded-full hover:bg-white active:bg-white">
        <Plus size={18} color={colors.primary} strokeWidth={2.6} />
      </Pressable>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, max, multiline }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; max: number; multiline?: boolean }) {
  return (
    <View className="rounded-2xl bg-white px-4 pb-2.5 pt-2.5">
      <Text className="text-[12px] font-bold uppercase text-text-secondary" style={{ letterSpacing: 0.6 }}>{label}</Text>
      <TextInput value={value} onChangeText={(v) => onChange(v.slice(0, max))} placeholder={placeholder} placeholderTextColor={colors.textSecondary} accessibilityLabel={label}
        multiline={multiline} className="text-[16px] text-text-primary" style={{ minHeight: multiline ? 56 : 28, paddingTop: 4, textAlignVertical: multiline ? 'top' : 'center' }} />
    </View>
  );
}
