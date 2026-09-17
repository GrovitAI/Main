/**
 * Finance module root.
 *
 * Self-contained: drop `<FinanceScreen />` into a route file
 * (e.g. src/app/(app)/finance.tsx) and register the tab in tab-config.ts when
 * the module is ready to ship. Nothing here touches navigation.
 */
import React, { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Landmark } from 'lucide-react-native';

import { colors } from '@/lib/pos/brand';
import { useResponsive, getResponsivePadding } from '@/lib/pos/useResponsive';
import { canViewAllBranches } from '@/lib/pos/branch-access';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { useFinanceStore } from '@/lib/pos/use-finance-store';
import { FinanceFilterBar, type FinanceBranchOption } from './FinanceFilterBar';
import { FinanceTabBar, financeTabsForRole } from './FinanceTabBar';
import { FinanceSchemaNotice } from './FinanceStateViews';
import { FinanceOverviewTab } from './FinanceOverviewTab';
import { LedgerTab } from './LedgerTab';
import { CashBookTab } from './CashBookTab';
import { DayCloseTab } from './DayCloseTab';
import { CatalogTab } from './CatalogTab';
import { PhoneFinanceScreen } from './PhoneFinanceScreen';

export type FinanceScreenProps = {
  /** Phone shell: opens the app drawer/menu from the header. */
  onMenuPress?: () => void;
};

export function FinanceScreen({ onMenuPress }: FinanceScreenProps) {
  const insets = useSafeAreaInsets();
  const { isPhone, isDesktop } = useResponsive();
  const session = useSessionStore((s) => s.session);

  const initialized = useFinanceStore((s) => s.initialized);
  const initialize = useFinanceStore((s) => s.initialize);
  const activeTab = useFinanceStore((s) => s.activeTab);
  const filters = useFinanceStore((s) => s.filters);
  const schema = useFinanceStore((s) => s.schema);
  const setTab = useFinanceStore((s) => s.setTab);
  const setPreset = useFinanceStore((s) => s.setPreset);
  const setCustomRange = useFinanceStore((s) => s.setCustomRange);
  const setBranch = useFinanceStore((s) => s.setBranch);
  const refreshActive = useFinanceStore((s) => s.refreshActive);
  const loading = useFinanceStore(
    (s) =>
      (s.activeTab === 'overview' && s.overviewLoading) ||
      (s.activeTab === 'expenses' && s.expensesLoading) ||
      (s.activeTab === 'cashbook' && s.ledgerLoading) ||
      (s.activeTab === 'dayclose' && s.dayCloseLoading),
  );

  const role = session?.role ?? null;
  const tabs = useMemo(() => financeTabsForRole(role), [role]);
  const allowedTab = tabs.some((tab) => tab.key === activeTab);

  useEffect(() => {
    // The tab is settled before the store loads, so an accountant's session
    // never fetches the revenue figures behind Overview.
    if (!allowedTab && tabs.length > 0) setTab(tabs[0].key);
    if (session && !initialized) void initialize();
  }, [session, initialized, initialize, allowedTab, tabs, setTab]);

  // Only the owner may switch branch or see them all; an admin sees their own.
  const canPickBranch = canViewAllBranches(session?.role);
  const branches: FinanceBranchOption[] = useMemo(
    () => (session?.accessibleBranches ?? []).filter((b) => b.is_active).map((b) => ({ id: b.id, name: b.name })),
    [session],
  );

  if (!session) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-tint px-6">
        <Text className="text-sm font-semibold text-text-secondary">Sign in to view finance.</Text>
      </View>
    );
  }

  if (isPhone) {
    return (
      <PhoneFinanceScreen
        activeTab={allowedTab ? activeTab : tabs[0]?.key ?? 'ledger'}
        tabs={tabs}
        filters={filters}
        branches={branches}
        canPickBranch={canPickBranch}
        loading={loading}
        schema={schema}
        onTab={setTab}
        onPreset={setPreset}
        onCustomRange={setCustomRange}
        onBranch={setBranch}
        onRefresh={() => void refreshActive()}
        onMenuPress={onMenuPress}
      />
    );
  }

  const padding = getResponsivePadding(false);

  return (
    <View className="flex-1 bg-surface-tint" style={{ paddingTop: insets.top }}>
      <View className="flex-1" style={{ paddingHorizontal: padding, paddingTop: 16 }}>
        {/* Title row. The tab bar shares it on desktop; a tablet held upright
            has no room for it beside the title, so there it gets its own row. */}
        <View className="mb-4 flex-row items-center justify-between">
          <View className="flex-1 flex-row items-center">
            <View className="mr-3 h-11 w-11 items-center justify-center rounded-2xl bg-primary">
              <Landmark size={22} color={colors.textOnPrimary} />
            </View>
            <View className="flex-1">
              <Text className="text-2xl font-extrabold tracking-tight text-text-primary">Finance</Text>
              <Text className="text-xs text-text-secondary" numberOfLines={1}>
                Revenue, expenses, cash book and day close · {session.tenantName}
              </Text>
            </View>
          </View>
          {isDesktop && tabs.length > 1 ? <FinanceTabBar active={activeTab} onChange={setTab} tabs={tabs} /> : null}
        </View>
        {!isDesktop && tabs.length > 1 ? (
          <View className="mb-4">
            <FinanceTabBar active={activeTab} onChange={setTab} tabs={tabs} />
          </View>
        ) : null}

        {activeTab !== 'catalog' ? (
          <FinanceFilterBar
            filters={filters}
            branches={branches}
            canPickBranch={canPickBranch}
            loading={loading}
            onPreset={setPreset}
            onCustomRange={setCustomRange}
            onBranch={setBranch}
            onRefresh={() => void refreshActive()}
          />
        ) : null}

        <FinanceSchemaNotice schema={schema} />

        <View className="flex-1" style={isDesktop ? { maxWidth: 1400, width: '100%', alignSelf: 'center' } : undefined}>
          {activeTab === 'overview' ? <FinanceOverviewTab /> : null}
          {activeTab === 'ledger' ? <LedgerTab /> : null}
          {activeTab === 'cashbook' ? <CashBookTab /> : null}
          {activeTab === 'dayclose' ? <DayCloseTab /> : null}
          {activeTab === 'catalog' ? <CatalogTab /> : null}
        </View>
      </View>
    </View>
  );
}

export default FinanceScreen;
