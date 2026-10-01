import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, FileText, Search, X } from 'lucide-react-native';

import { colors, semantic } from '@/lib/pos/brand';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import type { CounterpartySuggestion, FinanceAccount, FinanceEntry, Statement, StatementRow, StatementSubject } from '@/lib/pos/finance-types';
import { fetchCounterpartyNames, fetchStatementEntries, STATEMENT_MAX_ROWS } from '@/lib/pos/finance-ledger-service';
import { LEDGER_KIND_LABELS, LEDGER_MODE_LABELS } from '@/lib/pos/finance-ledger-utils';
import { buildStatement, rowBalanceLabel, statementBalanceLabel, statementIsCustomer } from '@/lib/pos/finance-statement-utils';
import { formatDateLabel, formatINR } from '@/lib/pos/finance-utils';
import { FinanceEmptyView, FinanceErrorView, FinanceLoadingView } from './FinanceStateViews';

export type StatementModalProps = {
  visible: boolean;
  /** Whose statement to open with; null opens on the picker. */
  initialSubject: StatementSubject | null;
  accounts: FinanceAccount[];
  /** The books the statement is read from: the kitchen, or the user's own branch. */
  homeAccountId: string;
  /** Other accounts of ours the user may open a statement with. */
  otherAccounts: FinanceAccount[];
  compact: boolean;
  /** Opens the ledger entry behind a row. */
  onOpenEntry: (entry: FinanceEntry) => void;
  onClose: () => void;
};

const FIELD_CLASS = 'min-h-[44px] flex-1 text-sm text-text-primary';

export function StatementModal({ visible, initialSubject, accounts, homeAccountId, otherAccounts, compact, onOpenEntry, onClose }: StatementModalProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [subject, setSubject] = useState<StatementSubject | null>(initialSubject);
  const [query, setQuery] = useState('');
  const [names, setNames] = useState<CounterpartySuggestion[]>([]);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setSubject(initialSubject);
    setQuery('');
    setStatement(null);
    setError(null);
  }, [visible, initialSubject]);

  // The picker: names already in the ledger, suppliers and staff.
  useEffect(() => {
    if (!visible || subject) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      void fetchCounterpartyNames(query, 12).then(({ data }) => {
        if (!cancelled) setNames(data ?? []);
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [visible, subject, query]);

  useEffect(() => {
    if (!visible || !subject) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchStatementEntries(subject).then(({ data, error: failure }) => {
      if (cancelled) return;
      setLoading(false);
      if (failure || !data) {
        setError(failure ?? 'Unable to load the statement.');
        setStatement(null);
        return;
      }
      setStatement(buildStatement(data.entries, subject, data.truncated));
    });
    return () => {
      cancelled = true;
    };
  }, [visible, subject, reload]);

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? 'Account';
  const subjectName = subject ? (subject.type === 'name' ? subject.name : accountName(subject.accountId)) : '';
  const homeName = subject?.type === 'account' ? accountName(subject.homeAccountId) : null;
  const customer = useMemo(() => (statement ? statementIsCustomer(statement) : false), [statement]);

  if (!visible) return null;

  const renderRow = ({ item }: { item: StatementRow }) => {
    const e = item.entry;
    const how = e.mode ? LEDGER_MODE_LABELS[e.mode] : e.kind === 'transfer' ? `${e.transfer_from} → ${e.transfer_to}` : null;
    const offset = e.mode === 'offset';
    return (
      <Pressable
        onPress={() => onOpenEntry(e)}
        className="min-h-[52px] flex-row items-center border-b border-border-soft py-2"
        style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={`${LEDGER_KIND_LABELS[e.kind]} ${formatINR(e.amount)} ${e.particulars}`}
      >
        <View className="flex-1 pr-2">
          <Text className="text-xs font-bold text-text-primary" numberOfLines={1}>{e.particulars}</Text>
          <Text className="text-[11px] text-text-secondary" numberOfLines={1}>
            {[formatDateLabel(e.transaction_date, true), LEDGER_KIND_LABELS[e.kind], how].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View className="items-end">
          {offset ? (
            <Text className="text-xs font-semibold text-text-secondary">Offset {formatINR(e.amount)}</Text>
          ) : (
            <Text className="text-xs font-extrabold text-text-primary">
              {item.billed > 0 ? <Text style={{ color: semantic.warning }}>{formatINR(item.billed)} billed</Text> : null}
              {item.billed > 0 && item.paid > 0 ? ' · ' : ''}
              {item.paid > 0 ? <Text style={{ color: semantic.success }}>{formatINR(item.paid)} paid</Text> : null}
            </Text>
          )}
          {subject ? (
            <Text className="text-[11px] font-semibold text-text-secondary">{rowBalanceLabel(item.balance, subject, customer, (r) => formatINR(r))}</Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const picker = (
    <View className="px-5 py-4">
      <View className="min-h-[44px] flex-row items-center rounded-xl border border-border bg-white px-3">
        <Search size={16} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Vendor, customer or staff name"
          placeholderTextColor={colors.textSecondary}
          className={`ml-2 ${FIELD_CLASS}`}
          autoFocus={!compact}
          accessibilityLabel="Search a name for the statement"
        />
      </View>
      {otherAccounts.length > 0 ? (
        <View className="mt-3">
          <Text className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-text-secondary">Between accounts</Text>
          <View className="flex-row flex-wrap gap-2">
            {otherAccounts.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => setSubject({ type: 'account', accountId: a.id, homeAccountId })}
                className="min-h-[40px] items-center justify-center rounded-full border border-border bg-white px-3.5"
                hitSlop={2}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={`Statement with ${a.name}`}
              >
                <Text className="text-xs font-bold text-text-primary">{a.kind === 'partner' ? `${a.name} (partner)` : a.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <Text className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wide text-text-secondary">Names</Text>
      {names.length === 0 ? (
        <Text className="py-3 text-xs text-text-secondary">
          {query.trim().length > 0 ? 'No name like that in the ledger, the suppliers or the staff.' : 'Names appear here once entries carry a "Paid to" or "Received from".'}
        </Text>
      ) : (
        <FlatList
          data={names}
          keyExtractor={(item) => item.name}
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: height * 0.4 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setSubject({ type: 'name', name: item.name })}
              className="min-h-[44px] flex-row items-center justify-between border-b border-border-soft"
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={`Statement of ${item.name}`}
            >
              <Text className="flex-1 text-sm font-semibold text-text-primary" numberOfLines={1}>{item.name}</Text>
              <Text className="ml-2 text-[11px] text-text-secondary">
                {item.uses > 0 ? `${item.uses} ${item.uses === 1 ? 'entry' : 'entries'}` : item.source === 'supplier' ? 'Supplier' : item.source === 'staff' ? 'Staff' : ''}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );

  const body = !subject ? (
    picker
  ) : loading ? (
    <View className="px-5 py-6"><FinanceLoadingView label="Loading the statement…" /></View>
  ) : error ? (
    <View className="px-5 py-4"><FinanceErrorView message={error} onRetry={() => setReload((n) => n + 1)} compact /></View>
  ) : statement ? (
    <View className="flex-1 px-5 pb-2 pt-3">
      <View className="mb-2 rounded-2xl bg-surface-tint px-3 py-3">
        <Text
          className="text-sm font-extrabold"
          style={{ color: statement.direction === 'settled' ? semantic.success : statement.direction === 'they_owe' ? semantic.warning : semantic.danger }}
        >
          {statementBalanceLabel(statement, subjectName, homeName, (r) => formatINR(r))}
        </Text>
        <Text className="mt-1 text-[11px] text-text-secondary">
          Billed {formatINR(statement.billed)} · Paid {formatINR(statement.paid)} · {statement.rows.length} {statement.rows.length === 1 ? 'entry' : 'entries'}, oldest first
        </Text>
        {statement.truncated ? (
          <Text className="mt-1 text-[11px] font-semibold" style={{ color: semantic.warning }}>
            Showing the latest {STATEMENT_MAX_ROWS} entries; the balance starts from there.
          </Text>
        ) : null}
      </View>
      <FlatList
        data={statement.rows}
        keyExtractor={(item) => item.entry.id}
        renderItem={renderRow}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <FinanceEmptyView
            title={`Nothing recorded with ${subjectName}`}
            subtitle="Bills on credit, payments and offsets appear here with a running balance."
          />
        }
      />
    </View>
  ) : null;

  return (
    <Modal visible transparent animationType={compact ? 'slide' : 'fade'} onRequestClose={onClose}>
      <KeyboardAvoider>
        <Pressable className={`flex-1 bg-black/40 ${compact ? 'justify-end' : 'items-center justify-center px-4'}`} onPress={onClose}>
          <Pressable
            onPress={() => undefined}
            className={`w-full overflow-hidden bg-white shadow-panel ${compact ? 'rounded-t-3xl' : 'max-w-[620px] rounded-3xl'}`}
            style={{ height: subject ? height * 0.86 : undefined, maxHeight: height * 0.9, paddingBottom: compact ? Math.max(12, insets.bottom) : 0 }}
          >
            <View className="flex-row items-center border-b border-border-soft px-3 py-3">
              {subject ? (
                <Pressable
                  onPress={() => setSubject(null)}
                  className="h-[44px] w-[44px] items-center justify-center rounded-full"
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Pick another name"
                >
                  <ChevronLeft size={20} color={colors.textSecondary} />
                </Pressable>
              ) : (
                <View className="h-[44px] w-[44px] items-center justify-center">
                  <FileText size={18} color={colors.primary} />
                </View>
              )}
              <View className="flex-1 px-1">
                <Text className="text-base font-bold text-text-primary" numberOfLines={1}>{subject ? subjectName : 'Statement'}</Text>
                <Text className="text-xs text-text-secondary" numberOfLines={1}>
                  {subject ? (homeName ? `Between ${subjectName} and ${homeName}` : 'Every bill, payment and offset, with a running balance') : 'Pick a vendor, a customer or one of our accounts'}
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                className="h-[44px] w-[44px] items-center justify-center rounded-full"
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            {body}
          </Pressable>
        </Pressable>
      </KeyboardAvoider>
    </Modal>
  );
}
