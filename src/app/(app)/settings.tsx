import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChefHat, Info, Landmark, Printer as PrinterIcon, ReceiptText, ShieldCheck, type LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { brand, colors, semantic } from '@/lib/pos/brand';
import { FINANCE_MODULE_ENABLED, KITCHEN_HOME } from '@/lib/pos/tab-config';
import { fetchPrinters, savePrinter, deletePrinter, syncPrintNodePrinters, type Printer } from '@/lib/pos/printer-db-service';
import { printerService, fetchPrintNodePrinters, type PrintNodePrinter } from '@/lib/printer/printer-service';
import { ApprovalPoliciesScreen } from '@/components/settings/ApprovalPoliciesScreen';
import { FinanceAccountsCard } from '@/components/finance/FinanceAccountsCard';
import { FinanceRulesCard } from '@/components/finance/FinanceRulesCard';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { storage, STORAGE_KEYS, DEFAULT_RECEIPT_FOOTER } from '@/lib/pos/storage';
import { getErrorMessage } from '@/lib/pos/error-utils';
import { confirmAction } from '@/lib/pos/dialogs';
import { Avatar, Card, Empty, KHeader, LinkButton, Notice, Row, RowInset, Section, Segmented, TextField, Toggle } from '@/components/kitchen/ui';

/** The parts of Settings; each opens as its own page (task 271, owner's pick: Settings A). */
type Pane = 'home' | 'printers' | 'receipt' | 'approvals' | 'finance' | 'about';
/** From this width the list stays on the left and the chosen page opens beside it. */
const SPLIT_FROM = 900;

/** The app's version from its config, the same on phones and the web (Expo leaves it out of a web build). */
const APP_VERSION = (require('../../../app.json') as { expo?: { version?: string } }).expo?.version ?? '';

const ROLE_LABELS: Record<string, string> = { owner: 'Owner', admin: 'Admin', manager: 'Manager', cashier: 'Cashier', kitchen: 'Kitchen', accountant: 'Accountant' };

/**
 * Settings, grouped list (task 271): the account at the top, then Printing, Till and More, each
 * row opening its own page. A phone shows one page at a time with Back; a laptop keeps the list
 * on the left and the page beside it. Currency, print protocol and the print bridge address moved
 * to About this device.
 */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const split = width >= SPLIT_FROM;
  const { session, signOut } = useSessionStore();
  const isOwnerOrAdmin = session?.role === 'owner' || session?.role === 'admin';
  // Finance rules apply to the whole business, so only the owner sets them.
  const isOwner = session?.role === 'owner';
  const [pane, setPane] = useState<Pane>(split ? 'printers' : 'home');
  useEffect(() => { if (split && pane === 'home') setPane('printers'); }, [split, pane]);

  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [receiptFooter, setReceiptFooter] = useState('');
  const [printNodePrinters, setPrintNodePrinters] = useState<PrintNodePrinter[]>([]);
  const [testingPrinterId, setTestingPrinterId] = useState<string | null>(null);

  const loadPrinters = async (shouldSync = false) => {
    setLoading(true);
    setFormError(null);
    try {
      // 1. Live printers from PrintNode, 2. synchronised into the database when asked.
      const pnPrinters = await fetchPrintNodePrinters();
      setPrintNodePrinters(pnPrinters);
      if (shouldSync && pnPrinters.length > 0) {
        const result = await syncPrintNodePrinters(pnPrinters);
        if (result.error) setFormError(`Printers could not be synchronised: ${result.error}`);
      }
    } catch (err) {
      setFormError(getErrorMessage(err) || 'Could not reach PrintNode. Check the counter PC, then refresh.');
    }
    // 3. The saved printer settings.
    const res = await fetchPrinters();
    if (res.data) setPrinters(res.data);
    setLoading(false);
  };

  useEffect(() => {
    // AsyncStorage rather than localStorage: the latter does not exist on
    // iOS or Android, so the footer silently reset on every device launch.
    void storage.get<string>(STORAGE_KEYS.receiptFooter).then((stored) => setReceiptFooter(stored || DEFAULT_RECEIPT_FOOTER));
    void loadPrinters(true);
  }, []);

  /** Saves one change to a printer and reloads the list, with a line saying what happened. */
  const updatePrinter = async (printer: Printer, changes: Partial<Printer>, done: string) => {
    setSubmitting(true);
    setSuccessMsg(null);
    setFormError(null);
    try {
      const res = await savePrinter({ ...printer, ...changes });
      if (res.error) setFormError(res.error);
      else { setSuccessMsg(done); await loadPrinters(false); }
    } catch (err) {
      setFormError(getErrorMessage(err) || 'Could not save the printer.');
    } finally {
      setSubmitting(false);
    }
  };
  const removePrinter = (printer: Printer) => {
    confirmAction('Remove this printer?', `${printer.name} leaves the list. Refresh brings it back from PrintNode.`, 'Remove', () => {
      void (async () => {
        setSubmitting(true); setSuccessMsg(null); setFormError(null);
        try {
          const res = await deletePrinter(printer.id);
          if (res.error) setFormError(res.error);
          else { setSuccessMsg(`${printer.name} removed.`); await loadPrinters(false); }
        } catch (err) {
          setFormError(getErrorMessage(err) || 'Could not remove the printer.');
        } finally {
          setSubmitting(false);
        }
      })();
    });
  };
  const testPrint = async (printer: Printer) => {
    setTestingPrinterId(printer.id);
    setSuccessMsg(null);
    setFormError(null);
    try {
      await printerService.testPrinter(printer);
      setSuccessMsg(`Test print sent to ${printer.name}.`);
    } catch (err) {
      setFormError(getErrorMessage(err) || 'Could not send the test print.');
    } finally {
      setTestingPrinterId(null);
    }
  };

  const liveOf = (printer: Printer): PrintNodePrinter | undefined => printNodePrinters.find((p) => String(p.id) === printer.ip_address);
  const online = printers.filter((p) => liveOf(p)?.state === 'online').length;
  const billPrinter = printers.find((p) => p.is_active && p.printer_role === 'bill' && p.is_default) ?? printers.find((p) => p.is_active && p.printer_role === 'bill');
  const kitchenPrinter = printers.find((p) => p.is_active && p.printer_role === 'kitchen');
  const printingLine = loading && printers.length === 0 ? 'Checking printers…'
    : printers.length === 0 ? 'No printers yet'
    : [billPrinter ? `Bills on ${billPrinter.name}` : 'No bill printer', kitchenPrinter ? `kitchen on ${kitchenPrinter.name}` : null].filter(Boolean).join(' · ');
  const version = APP_VERSION;

  type Item = { key: Pane; icon: LucideIcon; title: string; subtitle?: string; right?: string; show: boolean };
  const groups: { title: string; items: Item[] }[] = useMemo(() => [
    { title: 'Printing', items: [
      { key: 'printers' as const, icon: PrinterIcon, title: 'Printers', subtitle: printingLine, right: printers.length ? `${online} online` : undefined, show: true },
      { key: 'receipt' as const, icon: ReceiptText, title: 'Receipt footer', subtitle: `“${receiptFooter || DEFAULT_RECEIPT_FOOTER}”`, show: true },
    ] },
    { title: 'Till', items: [
      { key: 'approvals' as const, icon: ShieldCheck, title: 'Approvals', subtitle: 'Till actions that need the owner’s code', show: isOwnerOrAdmin },
      { key: 'finance' as const, icon: Landmark, title: 'Finance', subtitle: 'Accounts and rules', show: isOwner && FINANCE_MODULE_ENABLED },
    ] },
    { title: 'More', items: [
      { key: 'about' as const, icon: Info, title: 'About this device', subtitle: [version && `Version ${version}`, 'INR', 'ESC/POS'].filter(Boolean).join(' · '), show: true },
    ] },
  ].map((g) => ({ ...g, items: g.items.filter((i) => i.show) })).filter((g) => g.items.length > 0), [printingLine, printers.length, online, receiptFooter, isOwnerOrAdmin, isOwner, version]);

  const account = (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Avatar name={session?.displayName || 'You'} size={44} />
      <View className="min-w-0 flex-1">
        <Text className="text-[17px] font-bold text-text-primary" numberOfLines={1}>{session?.displayName || 'Signed in'}</Text>
        <Text className="text-[13px] font-semibold text-text-secondary" numberOfLines={1}>{[ROLE_LABELS[session?.role ?? ''] ?? session?.role, session?.branchName].filter(Boolean).join(' · ')}</Text>
      </View>
      <LinkButton label="Sign out" onPress={() => confirmAction('Sign out?', 'This device signs out. Others stay signed in.', 'Sign out', () => void signOut())} />
    </Card>
  );

  const list = (
    <View>
      {account}
      {groups.map((g) => (
        <Section key={g.title} title={g.title}>
          <Card padded={false} style={{ paddingHorizontal: 14, overflow: 'hidden' }}>
            <RowInset.Provider value={14}>
              {g.items.map((i) => (
                <Row key={i.key} icon={i.icon} iconTone="primary" title={i.title} subtitle={i.subtitle} right={i.right} selected={split && pane === i.key}
                  onPress={() => { setSuccessMsg(null); setFormError(null); setPane(i.key); }} />
              ))}
              {g.title === 'More' && isOwnerOrAdmin ? (
                <Row icon={ChefHat} iconTone="primary" title="Central Kitchen" subtitle="Books, stock and what each branch owes" onPress={() => router.push(KITCHEN_HOME as never)} />
              ) : null}
            </RowInset.Provider>
          </Card>
        </Section>
      ))}
    </View>
  );

  const feedback = (
    <>
      {formError ? <Notice text={formError} /> : null}
      {successMsg ? <Notice tone="in" text={successMsg} /> : null}
    </>
  );

  const printersPage = (
    <View>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-[13px] font-semibold text-text-secondary">From PrintNode on the counter PC. {printers.length ? `${online} of ${printers.length} online.` : ''}</Text>
        {loading ? <ActivityIndicator size="small" color={colors.primary} /> : <LinkButton label="Refresh" onPress={() => void loadPrinters(true)} />}
      </View>
      {feedback}
      {printers.length === 0 && !loading ? (
        <Card style={{ marginTop: 12 }}><Empty title="No printers yet" body="Install PrintNode on the counter PC and connect the printers, then refresh here." action={<LinkButton label="Refresh" onPress={() => void loadPrinters(true)} />} /></Card>
      ) : null}
      {printers.map((printer) => {
        const live = liveOf(printer);
        const isOnline = live?.state === 'online';
        return (
          <Card key={printer.id} padded={false} style={{ marginTop: 12, overflow: 'hidden' }}>
            <View className="flex-row items-center gap-3 px-3.5 pt-3.5">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-surface-tint"><PrinterIcon size={20} color={colors.primary} /></View>
              <View className="min-w-0 flex-1">
                <Text className="text-[15px] font-bold text-text-primary" numberOfLines={1}>{printer.name}</Text>
                <View className="flex-row items-center gap-1.5">
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isOnline ? semantic.success : colors.border }} />
                  <Text className="text-xs font-semibold text-text-secondary" numberOfLines={1}>{isOnline ? 'Online' : 'Offline'}{live?.computer?.name ? ` · ${live.computer.name}` : ''}</Text>
                </View>
              </View>
            </View>
            <View className="mt-2 border-t border-border-soft">
              <Toggle label="In use" hint={printer.is_active ? 'The till sends to this printer' : 'The till leaves this printer alone'} on={printer.is_active} disabled={submitting}
                onChange={(on) => void updatePrinter(printer, { is_active: on }, `${printer.name} ${on ? 'is in use' : 'is no longer used'}.`)} />
              {printer.is_active ? (
                <View className="border-t border-border-soft px-3.5 py-3">
                  <Text className="mb-2 text-[13px] font-bold text-text-secondary">Prints</Text>
                  <Segmented options={[{ value: 'bill', label: 'Bills' }, { value: 'kitchen', label: 'Kitchen orders' }]} value={printer.printer_role === 'kitchen' ? 'kitchen' : 'bill'}
                    onChange={(role) => void updatePrinter(printer, { printer_role: role, is_default: role === 'bill' ? printer.is_default : false }, `${printer.name} now prints ${role === 'bill' ? 'bills' : 'kitchen orders'}.`)} />
                </View>
              ) : null}
              {printer.is_active && printer.printer_role === 'bill' ? (
                <Toggle label="Main bill printer" hint="Bills go here when more than one printer prints bills" on={printer.is_default} disabled={submitting}
                  onChange={(on) => void updatePrinter(printer, { is_default: on }, on ? `${printer.name} is the main bill printer.` : `${printer.name} is no longer the main bill printer.`)} />
              ) : null}
              <View className="flex-row items-center justify-between border-t border-border-soft px-3.5">
                {testingPrinterId === printer.id ? <View className="min-h-[44px] justify-center"><ActivityIndicator size="small" color={colors.primary} /></View>
                  : <LinkButton label="Print a test page" onPress={() => void testPrint(printer)} />}
                <LinkButton label="Remove" onPress={() => removePrinter(printer)} />
              </View>
            </View>
          </Card>
        );
      })}
    </View>
  );

  const receiptPage = (
    <View>
      <TextField value={receiptFooter} onChange={(text) => { setReceiptFooter(text); void storage.set(STORAGE_KEYS.receiptFooter, text); }} label="Receipt footer" placeholder={DEFAULT_RECEIPT_FOOTER} multiline />
      <Text className="mt-1.5 text-xs font-semibold text-text-secondary">Saved as you type, on this device. Each till keeps its own.</Text>
      {/* What the bottom of a bill will look like. */}
      <View className="mt-5 self-center rounded-sm border border-border-soft bg-surface-elevated px-6 py-5" style={{ width: 260 }}>
        <View className="flex-row justify-between"><Text className="text-[13px] font-bold text-text-primary">Total</Text><Text className="text-[13px] font-bold text-text-primary">₹698.00</Text></View>
        <View className="my-3 border-t border-dashed border-border" />
        <Text className="text-center text-[13px] font-semibold text-text-primary">{receiptFooter || DEFAULT_RECEIPT_FOOTER}</Text>
      </View>
    </View>
  );

  const aboutPage = (
    <Card padded={false} style={{ paddingHorizontal: 14, overflow: 'hidden' }}>
      <RowInset.Provider value={14}>
        <Row title="App" subtitle={brand.name} right={version ? `Version ${version}` : undefined} />
        <Row title="Currency" subtitle="Bills and reports" right="INR (₹)" />
        <Row title="Print protocol" subtitle="Thermal printers" right="ESC/POS" />
        <Row title="Local print bridge" subtitle="The print agent on the counter PC" right="localhost:4545" />
      </RowInset.Provider>
    </Card>
  );

  const titles: Record<Pane, string> = { home: 'Settings', printers: 'Printers', receipt: 'Receipt footer', approvals: 'Approvals', finance: 'Finance', about: 'About this device' };
  const pageBody = pane === 'printers' ? printersPage : pane === 'receipt' ? receiptPage : pane === 'about' ? aboutPage
    : pane === 'finance' && FINANCE_MODULE_ENABLED ? <View><FinanceAccountsCard /><FinanceRulesCard /></View> : null;
  // The approvals page scrolls by itself.
  const page = pane === 'approvals' && isOwnerOrAdmin
    ? <View className="flex-1"><ApprovalPoliciesScreen /></View>
    : <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">{pageBody}</ScrollView>;

  if (!split) {
    return (
      <View className="flex-1 bg-kitchen-canvas" style={{ paddingTop: insets.top }}>
        {pane === 'home' ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
            <KHeader title="Settings" large />
            {list}
          </ScrollView>
        ) : (
          <View className="flex-1 px-4">
            <KHeader title={titles[pane]} onBack={() => { setSuccessMsg(null); setFormError(null); setPane('home'); }} />
            {page}
          </View>
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-kitchen-canvas" style={{ paddingTop: insets.top }}>
      <View className="w-full flex-1 flex-row self-center px-6 pt-6" style={{ maxWidth: 1120, gap: 24 }}>
        <ScrollView style={{ width: 340, flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 120 }}>
          <Text accessibilityRole="header" className="mb-4 text-[28px] font-bold text-text-primary" style={{ letterSpacing: -0.5 }}>Settings</Text>
          {list}
        </ScrollView>
        <View className="min-w-0 flex-1">
          <Text accessibilityRole="header" className="mb-3 mt-2 text-xl font-bold text-text-primary">{titles[pane]}</Text>
          {page}
        </View>
      </View>
    </View>
  );
}

