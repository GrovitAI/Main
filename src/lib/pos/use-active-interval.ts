import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

type ActiveIntervalOptions = {
  /** Whether the screen that owns the interval is the one on screen. */
  focused: boolean;
};

function isForeground(state: AppStateStatus | null | undefined): boolean {
  return state !== 'background' && state !== 'inactive';
}

/**
 * Runs `tick` every `intervalMs`, but only while the app is in the foreground
 * and the owning screen is focused. Leaving the screen, switching tabs in the
 * browser or backgrounding the installed app stops the loop; coming back runs
 * `tick` once straight away and starts it again.
 *
 * Polling loops that run on an idle till all day are the largest share of the
 * project's database egress, so nothing should poll without this.
 */
export function useActiveInterval(tick: () => void, intervalMs: number, { focused }: ActiveIntervalOptions): void {
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    if (!focused) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    let running = isForeground(AppState.currentState);

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => tickRef.current(), intervalMs);
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
        tickRef.current();
        start();
      } else if (!foreground && running) {
        running = false;
        stop();
      }
    });

    return () => {
      subscription.remove();
      stop();
    };
  }, [focused, intervalMs]);
}
