import { FinanceScreen } from '@/components/finance/FinanceScreen';

/**
 * Finance tab: overview and day close; deferred tools remain available in code.
 *
 * The screen picks its own phone or tablet layout, so the route only mounts it.
 */
export default function Finance() {
  return <FinanceScreen />;
}
