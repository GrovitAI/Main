import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { CheckCircle2, Wallet } from 'lucide-react-native';

import { colors, semantic } from '@/lib/pos/brand';
import type { FinanceAccount } from '@/lib/pos/finance-types';
import { parseAmountInput } from '@/lib/pos/finance-utils';
import { useLedgerStore } from '@/lib/pos/use-ledger-store';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { FinanceSectionCard } from './FinanceStateViews';

type Draft = { cash: string; bank: string };

const INPUT_CLASS = 'min-h-[44px] rounded-xl border border-border bg-white px-3 text-right text-sm font-bold text-text-primary';

function draftOf(account: FinanceAccount): Draft {
  return { cash: account.opening_cash.toString(), bank: account.opening_bank.toString() };
}

/**
 * Opening balances: what each account held in cash and at the bank on the
 * day the ledger started. Set once by the owner; every balance in Finance is
 * this plus what has been recorded since.
 */
export function FinanceAccountsCard() {
  const role = useSessionStore((s) => s.session?.role ?? null);
  const accounts = useLedgerStore((s) => s.accounts);
  const refreshReference = useLedgerStore((s) => s.refreshReference);
  const saveAccountOpening = useLedgerStore((s) => s.saveAccountOpening);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accounts.length === 0) void refreshReference();
  }, [accounts.length, refreshReference]);

  useEffect(() => {
    if (!savedId) return;
    const handle = setTimeout(() => setSavedId(null), 2500);
    return () => clearTimeout(handle);
  }, [savedId]);

  // The accounts and the rules behind them are the owner's alone.
  if (role !== 'owner') return null;

  const active = accounts.filter((a) => a.is_active);

  const save = async (account: FinanceAccount) => {
    const draft = drafts[account.id] ?? draftOf(account);
    const cash = parseAmountInput(draft.cash.trim() === '' ? '0' : draft.cash);
    const bank = parseAmountInput(draft.bank.trim() === '' ? '0' : draft.bank);
    if (cash === null || bank === null || cash < 0) {
      setError('Enter amounts like 20000 or 20000.50. Opening cash cannot be negative.');
      return;
    }
    setSaving(account.id);
    setError(null);
    const result = await saveAccountOpening(account.id, cash, bank);
    setSaving(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[account.id];
      return next;
    });
    setSavedId(account.id);
  };

  return (
    <FinanceSectionCard
      title="Opening balances"
      subtitle="What each account held in cash and at the bank when the ledger started"
      icon={<Wallet size={16} color={colors.primary} />}
      className="mb-4"
    >
      {active.length === 0 ? (
        <View className="flex-row items-center py-3">
          <ActivityIndicator size="small" color={colors.primary} />
          <Text className="ml-2 text-xs text-text-secondary">Loading…</Text>
        </View>
      ) : (
        <>
          {active.map((account) => {
            const draft = drafts[account.id] ?? draftOf(account);
            const changed = draft.cash !== account.opening_cash.toString() || draft.bank !== account.opening_bank.toString();
            const setDraft = (patch: Partial<Draft>) => setDrafts((prev) => ({ ...prev, [account.id]: { ...draft, ...patch } }));
            return (
              <View key={account.id} className="border-b border-border-soft py-3">
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 text-sm font-semibold text-text-primary" numberOfLines={1}>
                    {account.name}
                    {account.kind === 'partner' ? <Text className="text-xs font-normal text-text-secondary"> · partner</Text> : null}
                  </Text>
                  {savedId === account.id ? <CheckCircle2 size={16} color={semantic.success} /> : null}
                </View>
                <View className="mt-2 flex-row items-end gap-2">
                  <View className="flex-1">
                    <Text className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-secondary">Cash (₹)</Text>
                    <TextInput
                      value={draft.cash}
                      onChangeText={(t) => setDraft({ cash: t })}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colors.textSecondary}
                      className={INPUT_CLASS}
                      accessibilityLabel={`Opening cash of ${account.name}`}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-secondary">Bank (₹)</Text>
                    <TextInput
                      value={draft.bank}
                      onChangeText={(t) => setDraft({ bank: t })}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colors.textSecondary}
                      className={INPUT_CLASS}
                      accessibilityLabel={`Opening bank balance of ${account.name}`}
                    />
                  </View>
                  <Pressable
                    onPress={() => void save(account)}
                    disabled={!changed || saving !== null}
                    className="min-h-[44px] min-w-[72px] items-center justify-center rounded-xl bg-primary px-4"
                    style={({ pressed }) => [{ opacity: pressed || !changed || saving !== null ? 0.6 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Save the opening balance of ${account.name}`}
                  >
                    {saving === account.id ? <ActivityIndicator size="small" color={colors.textOnPrimary} /> : <Text className="text-sm font-bold text-text-on-primary">Save</Text>}
                  </Pressable>
                </View>
              </View>
            );
          })}
          <Text className="mt-3 text-[11px] text-text-secondary">
            Every balance in Finance is this opening amount plus what has been recorded since. If an opening amount was earlier typed as an
            entry in the Opening Balance category, void that entry so it is not counted twice. Dues carried over from before the ledger are
            recorded as a payable or a receivable.
          </Text>
          {error ? <Text className="mt-2 text-xs font-semibold" style={{ color: semantic.danger }}>{error}</Text> : null}
        </>
      )}
    </FinanceSectionCard>
  );
}
