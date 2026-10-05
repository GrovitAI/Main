import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

type ActiveIntervalOptions = {
  /** Whether the screen that owns the interval is the one on screen. */
  focused: boolean;
  /** For callbacks updating shared state: copies share one polling budget within this app. */
  pollKey?: string;
};

type PollBudget = { pending: boolean; startedAt: number | null; subscribers: number };
const pollBudgets = new Map<string, PollBudget>();

function isForeground(state: AppStateStatus | null | undefined): boolean {
  return state !== 'background' && state !== 'inactive';
}

/**
 * Runs `tick` every `intervalMs`, but only while the app is in the foreground
 * and the owning screen is focused. Leaving the screen, switching tabs in the
 * browser or backgrounding the installed app stops the loop; coming back runs
 * `tick` once (unless a recent or pending poll already covers it) and starts it again.
 *
 * Polling loops that run on an idle till all day are the largest share of the
 * project's database egress, so nothing should poll without this.
 */
export function useActiveInterval(tick: () => void | Promise<void>, intervalMs: number, { focused, pollKey }: ActiveIntervalOptions): void {
  const tickRef = useRef(tick);
  const budgetRef = useRef<PollBudget>({ pending: false, startedAt: null, subscribers: 0 });
  tickRef.current = tick;

  useEffect(() => {
    if (!focused) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    let running = isForeground(AppState.currentState);
    const budget = pollKey
      ? pollBudgets.get(pollKey) ?? { pending: false, startedAt: null, subscribers: 0 }
      : budgetRef.current;
    if (pollKey) pollBudgets.set(pollKey, budget);
    budget.subscribers += 1;

    const release = () => {
      if (pollKey && budget.subscribers === 0 && !budget.pending && pollBudgets.get(pollKey) === budget) {
        pollBudgets.delete(pollKey);
      }
    };

    // A slow request must finish before another poll starts, including when
    // the user backgrounds and reopens the app while it is still pending.
    const run = async (): Promise<void> => {
      const now = Date.now();
      if (budget.pending || (budget.startedAt !== null && now - budget.startedAt < intervalMs)) return;
      budget.pending = true;
      budget.startedAt = now;
      try {
        await tickRef.current();
      } catch {
        // Callers handle their UI errors; avoid an unhandled timer rejection.
        if (__DEV__) console.warn('[useActiveInterval] Background refresh failed.');
      } finally {
        budget.pending = false;
        release();
      }
    };

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => void run(), intervalMs);
    };
    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };

    if (running) start();

    const subscription = AppState.addEventListener('change', (state) => {
      const foreground = isForeground(state);
      if (foreground && !running) {
        running = true;
        void run();
        start();
      } else if (!foreground && running) {
        running = false;
        stop();
      }
    });

    return () => {
      subscription.remove();
      stop();
      budget.subscribers -= 1;
      release();
    };
  }, [focused, intervalMs, pollKey]);
}
