import { FinanceScreen } from '@/components/finance/FinanceScreen';

/**
 * Finance tab: overview, expenses, cash book and day close.
 *
 * The screen picks its own phone or tablet layout, so the route only mounts it.
 */
export default function Finance() {
  return <FinanceScreen />;
}
