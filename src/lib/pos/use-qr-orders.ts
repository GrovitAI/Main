import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { buzz } from '@/lib/pos/kitchen-haptics';
import { fetchQrPending, QR_NEEDS_UPDATE, QR_NOT_ALLOWED, type QrPendingOrder } from '@/lib/pos/qr-orders-service';

/** How often the till looks for new table orders, and how often when the branch does not take them. */
export const QR_POLL_MS = 15_000;
export const QR_IDLE_POLL_MS = 120_000;

/** True while the screen is in front: a hidden browser tab or a phone in the background does not ask. */
function inFront(): boolean {
  if (Platform.OS === 'web') return typeof document === 'undefined' || document.visibilityState !== 'hidden';
  return AppState.currentState === 'active';
}

/**
 * Task 333: the table orders customers have sent and nobody has answered. Looks every 15 seconds while
 * the branch takes table orders (every 2 minutes when it does not), only while the screen is in front,
 * and gives a short buzz on a phone when a new one arrives. Stops for good when the login may not see
 * them or the database has no table ordering yet.
 */
export function useQrOrders(active: boolean): { enabled: boolean; orders: QrPendingOrder[]; refresh: () => Promise<void> } {
  const [enabled, setEnabled] = useState(false);
  const [orders, setOrders] = useState<QrPendingOrder[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const enabledNow = useRef(false);
  const stopped = useRef(false);

  const refresh = useCallback(async (): Promise<void> => {
    const res = await fetchQrPending();
    if (res.data === null) {
      if (res.error === QR_NOT_ALLOWED || res.error === QR_NEEDS_UPDATE) stopped.current = true;
      return;
    }
    enabledNow.current = res.data.enabled;
    setEnabled(res.data.enabled);
    setOrders(res.data.orders);
    const known = seen.current;
    if (known && res.data.orders.some((o) => !known.has(o.id))) buzz('success');
    seen.current = new Set(res.data.orders.map((o) => o.id));
  }, []);

  useEffect(() => {
    if (!active) return;
    stopped.current = false;
    seen.current = null;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const loop = async (): Promise<void> => {
      if (inFront()) await refresh();
      if (!live || stopped.current) return;
      timer = setTimeout(() => void loop(), enabledNow.current ? QR_POLL_MS : QR_IDLE_POLL_MS);
    };
    void loop();
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [active, refresh]);

  return { enabled, orders, refresh };
}
