import { useCallback, useEffect, useMemo, useState } from 'react';
import { Share, View } from 'react-native';
import { QrCode as QrIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { QrCode } from '@/components/qr/QrCode';
import { Card, Empty, LinkButton, Notice, PrimaryButton, SelectRow, SettingsGroup, Sheet, SkeletonRows, TextField, Toggle, ValueRow } from '@/components/kitchen/ui';
import { colors } from '@/lib/pos/brand';
import { fetchBranches, type Branch } from '@/lib/pos/branch-service';
import { confirmAction } from '@/lib/pos/dialogs';
import { addQrTables, fetchQrSettings, setQrEnabled, updateQrTable } from '@/lib/pos/qr-orders-service';
import { printQrSheet } from '@/lib/pos/qr-sheet-print';
import { MAX_TABLES, nextTableLabels, QR_DEFAULT_ORIGIN, tableLink, tableTitle, type QrSettings, type QrTable } from '@/lib/pos/qr-table-utils';
import { useSessionStore } from '@/lib/pos/use-session-store';

const origin = (): string => (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : QR_DEFAULT_ORIGIN);

/**
 * Tasks 332 and 335: Table ordering in Settings. A switch for the outlet, its tables, and each table's QR
 * code to show, copy or print. Every outlet has its own switch and its own tables: the owner picks the
 * outlet at the top; a manager or admin works on their own. Customers scan a code to see the menu and send
 * an order; staff accept it at the till. Managers and above only (the database checks it too).
 */
export function QrTablesSettings() {
  const session = useSessionStore((s) => s.session);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>(session?.branchId ?? '');
  // Only the owner works across outlets; everyone else is tied to their own.
  const outlets = session?.role === 'owner' ? branches : [];
  const branchName = (branches.find((b) => b.id === branchId)?.name ?? session?.branchName) || 'Le Laban';
  const [data, setData] = useState<QrSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [count, setCount] = useState('');
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchQrSettings(branchId || undefined);
    setLoading(false);
    setError(res.error);
    if (res.data) setData(res.data);
  }, [branchId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (session?.role !== 'owner') return;
    void fetchBranches().then((res) => { if (!res.error) setBranches(res.data.filter((b) => b.is_active)); });
  }, [session?.role]);

  const tables = useMemo(() => data?.tables ?? [], [data]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? tables.filter((t) => tableTitle(t.label).toLowerCase().includes(q)) : tables;
  }, [tables, query]);
  const open = tables.find((t) => t.id === openId) ?? null;
  const amount = Math.floor(Number(count));
  const labels = nextTableLabels(tables.map((t) => t.label), amount);
  const addWhy = !Number.isFinite(amount) || amount < 1 ? 'Enter how many' : labels.length === 0 ? `A branch can have up to ${MAX_TABLES} tables` : undefined;

  const act = async (work: () => Promise<{ error: string | null }>, done: string | null): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await work();
    setBusy(false);
    if (res.error) { setError(res.error); return false; }
    if (done) setNotice(done);
    await load();
    return true;
  };

  const toggle = async (on: boolean) => { await act(() => setQrEnabled(on, branchId || undefined), on ? `Table ordering is on for ${branchName}.` : `Table ordering is off for ${branchName}.`); };

  const add = async () => {
    if (addWhy) return;
    const ok = await act(() => addQrTables(labels, branchId || undefined), `${labels.length} ${labels.length === 1 ? 'table' : 'tables'} added.`);
    if (ok) { setAdding(false); setCount(''); }
  };

  const link = (t: QrTable): string => tableLink(origin(), t.code);
  const copy = async (t: QrTable) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) { await navigator.clipboard.writeText(link(t)); setNotice('Link copied.'); return; }
      await Share.share({ message: link(t) });
    } catch { setError('Unable to copy the link.'); }
  };
  const print = async (list: QrTable[]) => {
    setBusy(true);
    const res = await printQrSheet(branchName, list, origin());
    setBusy(false);
    setError(res.error);
  };

  const rename = async (t: QrTable) => {
    const ok = await act(() => updateQrTable(t.id, { label: name.trim() }, branchId || undefined), 'Saved.');
    if (ok) setOpenId(null);
  };
  const newCode = (t: QrTable) => confirmAction('New QR code?', `The printed code for ${tableTitle(t.label)} stops working. Print the new one.`, 'New code', () => { void act(() => updateQrTable(t.id, { newCode: true }, branchId || undefined), 'New code made. Print it.'); });

  const switchOutlet = (id: string) => { setBranchId(id); setData(null); setOpenId(null); setQuery(''); setError(null); setNotice(null); };

  if (loading && !data && outlets.length === 0) return <SkeletonRows count={3} label="Loading table ordering" />;

  const active = tables.filter((t) => t.is_active);
  return (
    <View>
      {error ? <Notice text={error} action={<LinkButton label="Retry" onPress={() => void load()} />} /> : null}
      {notice ? <Notice tone="in" text={notice} /> : null}
      {outlets.length > 1 ? (
        <View style={{ marginBottom: 12 }}>
          <SettingsGroup>
            <SelectRow label="Outlet" value={branchId} options={outlets.map((b) => ({ value: b.id, label: b.name }))} onChange={switchOutlet} disabled={busy} />
          </SettingsGroup>
        </View>
      ) : null}
      {loading && !data ? <SkeletonRows count={3} label="Loading table ordering" /> : <>
      <SettingsGroup>
        <Toggle label="Table ordering" on={data?.enabled === true} disabled={busy || !data} onChange={(on) => void toggle(on)} />
      </SettingsGroup>
      {data && tables.length === 0 && !loading ? (
        <Card style={{ marginTop: 12 }}><Empty title="No tables yet" action={<LinkButton label="Add tables" onPress={() => setAdding(true)} />} /></Card>
      ) : (
        <View style={{ marginTop: 12, gap: 10 }}>
          {tables.length > 8 ? <TextField value={query} onChange={setQuery} label="Search tables" placeholder="Search tables" /> : null}
          <SettingsGroup>
            {shown.map((t) => (
              <ValueRow key={t.id} label={tableTitle(t.label)} value={t.is_active ? 'QR code' : 'Off'} action="open"
                lead={<View className="h-9 w-9 items-center justify-center rounded-xl bg-surface-tint"><QrIcon size={18} color={t.is_active ? colors.primary : colors.textSecondary} /></View>}
                onPress={() => { setOpenId(t.id); setName(t.label); }} />
            ))}
          </SettingsGroup>
          {shown.length === 0 ? <Text className="px-1 text-[13px] font-semibold text-text-secondary">No table matches that.</Text> : null}
          <View className="flex-row flex-wrap items-center" style={{ columnGap: 14 }}>
            <LinkButton label="Add tables" onPress={() => setAdding(true)} />
            {active.length > 0 ? <LinkButton label={busy ? 'Preparing…' : 'Print all QR codes'} onPress={() => void print(active)} /> : null}
          </View>
        </View>
      )}

      <Sheet visible={adding} onClose={() => setAdding(false)} title="Add tables" dirty={count !== ''}>
        <TextField value={count} onChange={(v) => setCount(v.replace(/[^0-9]/g, '').slice(0, 3))} label="How many" placeholder="0" keyboardType="numeric" autoFocus />
        {labels.length > 0 ? (
          <Text className="mt-2 text-[13px] font-semibold text-text-secondary">
            {labels.length === 1 ? tableTitle(labels[0] ?? '') : `${tableTitle(labels[0] ?? '')} to ${tableTitle(labels[labels.length - 1] ?? '')}`}
          </Text>
        ) : null}
        <View className="mt-4"><PrimaryButton label="Add" onPress={() => void add()} disabled={!!addWhy} loading={busy} reason={addWhy} /></View>
      </Sheet>

      <Sheet visible={open !== null} onClose={() => setOpenId(null)} title={open ? tableTitle(open.label) : ''} dirty={!!open && name.trim() !== open.label}>
        {open ? (
          <View style={{ gap: 12 }}>
            <View className="items-center" style={{ opacity: open.is_active ? 1 : 0.35 }}><QrCode value={link(open)} size={200} /></View>
            <Text className="text-center text-xs font-semibold text-text-secondary" selectable>{link(open)}</Text>
            <View className="flex-row items-center justify-center" style={{ columnGap: 14 }}>
              <LinkButton label="Copy link" onPress={() => void copy(open)} />
              <LinkButton label={busy ? 'Preparing…' : 'Print'} onPress={() => void print([open])} />
            </View>
            <TextField value={name} onChange={(v) => setName(v.slice(0, 20))} label="Name" placeholder="Table name" />
            {name.trim() && name.trim() !== open.label ? <PrimaryButton label="Save" onPress={() => void rename(open)} loading={busy} /> : null}
            <SettingsGroup>
              <Toggle label="In use" on={open.is_active} disabled={busy} onChange={(on) => void act(() => updateQrTable(open.id, { active: on }, branchId || undefined), null)} />
            </SettingsGroup>
            <View className="items-start"><LinkButton label="New QR code" onPress={() => newCode(open)} /></View>
          </View>
        ) : null}
      </Sheet>
      </>}
    </View>
  );
}
