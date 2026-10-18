import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export type BuzzKind = 'success' | 'select' | 'error';

let lastBuzz = 0;

/**
 * A short vibration in the installed phone app (task 216): a firm double on a
 * confirmed save, a light tick on a selection, a warning on an error. Browsers
 * stay silent, calls within 60 ms collapse into one (a "select all" ticks many
 * boxes at once), and a phone without haptics simply does nothing.
 */
export function buzz(kind: BuzzKind): void {
  if (Platform.OS === 'web') return;
  const now = Date.now();
  if (now - lastBuzz < 60) return;
  lastBuzz = now;
  try {
    const run = kind === 'select'
      ? Haptics.selectionAsync()
      : Haptics.notificationAsync(kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    void run.catch(() => undefined);
  } catch {
    // No haptics engine: nothing to do.
  }
}
