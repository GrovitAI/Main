import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, FileSpreadsheet, X } from 'lucide-react-native';

import { colors, semantic } from '@/lib/pos/brand';
import type { CatalogItem, FinanceAccount } from '@/lib/pos/finance-types';
import { fetchMonthBook } from '@/lib/pos/finance-ledger-service';
import { getCurrentBusinessDate } from '@/lib/pos/finance-utils';
import { buildMonthWorkbook, monthBounds, monthLabel, shiftMonth, workbookFileName } from '@/lib/pos/finance-workbook';

export type ExportMonthModalProps = {
  visible: boolean;
  /** Every account, for the names in the sheets. */
  accounts: FinanceAccount[];
  /** The accounts this user keeps books for: one workbook each. */
  scopeAccounts: FinanceAccount[];
  defaultAccountId: string;
  catalog: CatalogItem[];
  compact: boolean;
  onClose: () => void;
};

/**
 * The month-end workbook: one Excel file per account per month with a
 * summary by category, every transaction and what is still outstanding.
 */
export function ExportMonthModal({ visible, accounts, scopeAccounts, defaultAccountId, catalog, compact, onClose }: ExportMonthModalProps) {
  const insets = useSafeAreaInsets();
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [month, setMonth] = useState(() => getCurrentBusinessDate().slice(0, 7));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setAccountId(defaultAccountId);
    setMonth(getCurrentBusinessDate().slice(0, 7));
    setError(null);
    setDone(null);
  }, [visible, defaultAccountId]);

  if (!visible) return null;

  const active = scopeAccounts.filter((a) => a.is_active);
  const account = active.find((a) => a.id === accountId) ?? null;
  const thisMonth = getCurrentBusinessDate().slice(0, 7);
  const isWeb = Platform.OS === 'web';

  const download = async () => {
    const bounds = monthBounds(month);
    if (!account || !bounds) return;
    setWorking(true);
    setError(null);
    setDone(null);
    try {
      const { data, error: failure } = await fetchMonthBook(account.id, bounds.start, bounds.end);
      if (failure || !data) {
        setError(failure ?? 'Unable to load the month.');
        return;
      }
      const sheets = buildMonthWorkbook({
        accountId: account.id,
        accountName: account.name,
        month,
        entries: data.entries,
        openDues: data.openDues,
        catalog,
        accounts,
        opening: data.opening,
        closing: data.closing,
      });
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      for (const sheet of sheets) {
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
      }
      const fileName = workbookFileName(account.name, month);
      XLSX.writeFile(workbook, fileName);
      setDone(`${fileName} · ${data.entries.length} ${data.entries.length === 1 ? 'entry' : 'entries'}`);
    } catch {
      setError('Unable to build the workbook.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal visible transparent animationType={compact ? 'slide' : 'fade'} onRequestClose={onClose}>
      <Pressable className={`flex-1 bg-black/40 ${compact ? 'justify-end' : 'items-center justify-center px-4'}`} onPress={onClose}>
        <Pressable
          onPress={() => undefined}
          className={`w-full overflow-hidden bg-white shadow-panel ${compact ? 'rounded-t-3xl' : 'max-w-[520px] rounded-3xl'}`}
          style={compact ? { paddingBottom: Math.max(12, insets.bottom) } : undefined}
        >
          <View className="flex-row items-center border-b border-border-soft px-5 py-4">
            <FileSpreadsheet size={18} color={colors.primary} />
            <View className="flex-1 px-3">
              <Text className="text-base font-bold text-text-primary">Month-end workbook</Text>
              <Text className="text-xs text-text-secondary">Summary by category, every transaction and what is outstanding, as one Excel file.</Text>
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

          <View className="px-5 py-4">
            <Text className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-text-secondary">Account</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
              {active.map((a) => {
                const selected = a.id === accountId;
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => setAccountId(a.id)}
                    className={`min-h-[40px] items-center justify-center rounded-full border px-3.5 ${selected ? 'border-primary bg-primary' : 'border-border bg-white'}`}
                    hitSlop={2}
                    style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text className={`text-xs font-bold ${selected ? 'text-text-on-primary' : 'text-text-primary'}`}>
                      {a.kind === 'partner' ? `${a.name} (partner)` : a.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wide text-text-secondary">Month</Text>
            <View className="flex-row items-center">
              <Pressable
                onPress={() => setMonth((m) => shiftMonth(m, -1))}
                className="h-[44px] w-[44px] items-center justify-center rounded-full border border-border bg-white"
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
              >
                <ChevronLeft size={18} color={colors.textPrimary} />
              </Pressable>
              <Text className="flex-1 text-center text-sm font-extrabold text-text-primary">{monthLabel(month)}</Text>
              <Pressable
                onPress={() => setMonth((m) => shiftMonth(m, 1))}
                disabled={month >= thisMonth}
                className="h-[44px] w-[44px] items-center justify-center rounded-full border border-border bg-white"
                style={({ pressed }) => [{ opacity: pressed || month >= thisMonth ? 0.4 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Next month"
              >
                <ChevronRight size={18} color={colors.textPrimary} />
              </Pressable>
            </View>

            {!isWeb ? (
              <Text className="mt-4 text-xs text-text-secondary">
                The workbook downloads from the web app. Open Finance in a browser on this phone or on a computer to save it.
              </Text>
            ) : null}
            {error ? <Text className="mt-4 text-xs font-semibold" style={{ color: semantic.danger }}>{error}</Text> : null}
            {done ? <Text className="mt-4 text-xs font-semibold" style={{ color: semantic.success }}>Downloaded {done}</Text> : null}

            <Pressable
              onPress={() => void download()}
              disabled={working || !account || !isWeb}
              className="mt-5 min-h-[44px] flex-row items-center justify-center rounded-xl bg-primary px-5"
              style={({ pressed }) => [{ opacity: pressed || working || !account || !isWeb ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Download the workbook"
            >
              {working ? <ActivityIndicator size="small" color={colors.textOnPrimary} /> : <FileSpreadsheet size={16} color={colors.textOnPrimary} />}
              <Text className="ml-2 text-sm font-bold text-text-on-primary">{working ? 'Building…' : 'Download Excel'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
