import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { CheckCircle2, Landmark } from 'lucide-react-native';

import { colors, semantic } from '@/lib/pos/brand';
import type { FinanceRules } from '@/lib/pos/finance-types';
import { useLedgerStore } from '@/lib/pos/use-ledger-store';
import { FinanceSectionCard } from './FinanceStateViews';

type RuleKey = Exclude<keyof FinanceRules, 'tenant_id' | 'day_end_time'>;

const RULES: { key: RuleKey; label: string; detail: string }[] = [
  { key: 'clerk_sees_balances', label: 'Clerks can see balances', detail: 'Cash and bank balances, and the profit figures.' },
  { key: 'clerk_sees_partner_entries', label: "Clerks can see the partners' entries", detail: 'Off: clerks see only what clerks recorded.' },
  { key: 'clerk_edits_after_day_end', label: 'Clerks can edit after the day ends', detail: 'Off: their own entries, until the day ends.' },
  { key: 'clerk_can_void', label: 'Clerks can void their own entries', detail: 'A reason is always required; nothing is deleted.' },
  { key: 'clerk_can_transfer', label: 'Clerks can record cash ↔ bank transfers', detail: 'Off: transfers are the owner’s.' },
];

/**
 * The owner's switches for what clerks may do in the ledger. Each change is
 * saved as it is made; the database policies read the same row, so a switch
 * takes effect everywhere at once.
 */
export function FinanceRulesCard() {
  const rules = useLedgerStore((s) => s.rules);
  const refreshReference = useLedgerStore((s) => s.refreshReference);
  const saveRules = useLedgerStore((s) => s.saveRules);
  const [saving, setSaving] = useState<RuleKey | 'day_end_time' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dayEndDraft, setDayEndDraft] = useState('00:00');

  useEffect(() => {
    if (!rules) void refreshReference();
  }, [rules, refreshReference]);

  useEffect(() => {
    if (rules) setDayEndDraft(rules.day_end_time);
  }, [rules]);

  useEffect(() => {
    if (!saved) return;
    const handle = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(handle);
  }, [saved]);

  const toggle = async (key: RuleKey, value: boolean) => {
    setSaving(key);
    setError(null);
    const result = await saveRules({ [key]: value });
    setSaving(null);
    if (!result.ok) setError(result.error);
    else setSaved(true);
  };

  const saveDayEnd = async () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dayEndDraft)) {
      setError('Enter the day end as HH:MM, for example 00:00 or 02:30.');
      return;
    }
    setSaving('day_end_time');
    setError(null);
    const result = await saveRules({ day_end_time: dayEndDraft });
    setSaving(null);
    if (!result.ok) setError(result.error);
    else setSaved(true);
  };

  return (
    <FinanceSectionCard
      title="Finance rules"
      subtitle="What an accountant or manager may do in the ledger"
      icon={<Landmark size={16} color={colors.primary} />}
      className="mb-4"
      right={saved ? <CheckCircle2 size={18} color={semantic.success} /> : null}
    >
      {!rules ? (
        <View className="flex-row items-center py-3">
          <ActivityIndicator size="small" color={colors.primary} />
          <Text className="ml-2 text-xs text-text-secondary">Loading…</Text>
        </View>
      ) : (
        <>
          {RULES.map((rule) => (
            <View key={rule.key} className="min-h-[52px] flex-row items-center justify-between border-b border-border-soft py-2">
              <View className="flex-1 pr-3">
                <Text className="text-sm font-semibold text-text-primary">{rule.label}</Text>
                <Text className="text-[11px] text-text-secondary">{rule.detail}</Text>
              </View>
              {saving === rule.key ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Switch
                  value={rules[rule.key]}
                  onValueChange={(v) => void toggle(rule.key, v)}
                  trackColor={{ false: colors.border, true: colors.primaryLight }}
                  thumbColor={colors.background}
                  accessibilityLabel={rule.label}
                />
              )}
            </View>
          ))}

          <View className="mt-3 flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-semibold text-text-primary">Ledger day ends at</Text>
              <Text className="text-[11px] text-text-secondary">IST. Clerks can edit an entry until this time passes.</Text>
            </View>
            <TextInput
              value={dayEndDraft}
              onChangeText={setDayEndDraft}
              placeholder="00:00"
              placeholderTextColor={colors.textSecondary}
              className="min-h-[44px] w-[84px] rounded-xl border border-border bg-white px-3 text-center text-sm font-bold text-text-primary"
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="Ledger day end time"
            />
            <Pressable
              onPress={() => void saveDayEnd()}
              disabled={saving !== null || dayEndDraft === rules.day_end_time}
              className="ml-2 min-h-[44px] items-center justify-center rounded-xl bg-primary px-4"
              style={({ pressed }) => [{ opacity: pressed || saving !== null || dayEndDraft === rules.day_end_time ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Save the day end time"
            >
              {saving === 'day_end_time' ? <ActivityIndicator size="small" color={colors.textOnPrimary} /> : <Text className="text-sm font-bold text-text-on-primary">Save</Text>}
            </Pressable>
          </View>

          {error ? (
            <Text className="mt-3 text-xs font-semibold" style={{ color: semantic.danger }}>{error}</Text>
          ) : null}
        </>
      )}
    </FinanceSectionCard>
  );
}
