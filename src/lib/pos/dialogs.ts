import { useSyncExternalStore } from 'react';
import { Alert, Platform } from 'react-native';

// ─── In-app dialogs on the web (task 281) ────────────────────────────────────
// Browsers inside other apps (the desktop app's own browser, some phone in-app browsers) block
// window.confirm and window.alert without a word: the answer comes back as "no", so a Back that
// asks "Leave without saving?" did nothing at all. On the web these questions are drawn by the app
// itself (DialogHost, in the root layout). Until the host is on screen the browser's own dialog
// is still used.

export type DialogButton = { label: string; kind: 'cancel' | 'confirm' | 'destructive'; onPress?: () => void };
export type DialogRequest = { id: number; title: string; message?: string; buttons: DialogButton[] };

let queue: DialogRequest[] = [];
let nextId = 1;
let hosts = 0;
const listeners = new Set<() => void>();
const emit = (): void => { listeners.forEach((l) => l()); };

/** Shows a dialog in the app; returns false when no host is on screen to show it. */
export function showDialog(request: Omit<DialogRequest, 'id'>): boolean {
  if (hosts === 0) return false;
  queue = [...queue, { ...request, id: nextId++ }];
  emit();
  return true;
}

/** Closes a dialog and runs the button's action, if one was pressed. */
export function answerDialog(id: number, button?: DialogButton): void {
  queue = queue.filter((d) => d.id !== id);
  emit();
  button?.onPress?.();
}

/** The dialog open now (the oldest still open), or null. */
export function currentDialog(): DialogRequest | null {
  return queue[0] ?? null;
}

/** The dialog to show now, for the host. */
export function useCurrentDialog(): DialogRequest | null {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    currentDialog,
    () => null,
  );
}

/** DialogHost registers itself while mounted; returns the cleanup. */
export function registerDialogHost(): () => void {
  hosts += 1;
  return () => { hosts = Math.max(0, hosts - 1); };
}

/**
 * A message the user must see. react-native-web's Alert.alert is an empty
 * function, so on the web a screen that relies on it says nothing at all;
 * there the browser's own dialog is used instead.
 */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    if (showDialog({ title, message, buttons: [{ label: 'OK', kind: 'confirm' }] })) return;
    if (typeof window !== 'undefined') window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

/** Asks before something that cannot be undone. Runs `onConfirm` only on a yes. */
export function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void
): void {
  if (Platform.OS === 'web') {
    if (showDialog({ title, message, buttons: [{ label: 'No', kind: 'cancel' }, { label: confirmLabel, kind: 'destructive', onPress: onConfirm }] })) return;
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'No', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

type WebAlertButton = { text?: string; onPress?: (value?: string) => void; style?: 'default' | 'cancel' | 'destructive' };

/**
 * Task 263: react-native-web's Alert.alert does nothing, so on the web a confirmation (deactivate a
 * branch, clear a menu item) or an error message built on it never showed and never ran. Installed
 * once at startup, this sends Alert.alert to the browser's own dialogs: one button is a message,
 * two or more ask OK/Cancel and OK runs the destructive (or last) action. Phones keep the native
 * alert.
 */
export function installWebAlert(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const webAlert = (title: string, message?: string, buttons?: WebAlertButton[]): void => {
    const text = message ? `${title}\n\n${message}` : title;
    const list = buttons ?? [];
    const cancel = list.find((b) => b.style === 'cancel');
    const actions = list.filter((b) => b.style !== 'cancel');
    if (list.length <= 1) {
      if (showDialog({ title, message, buttons: [{ label: list[0]?.text ?? 'OK', kind: 'confirm', onPress: () => list[0]?.onPress?.() }] })) return;
      window.alert(text);
      list[0]?.onPress?.();
      return;
    }
    const action = actions.find((b) => b.style === 'destructive') ?? actions[actions.length - 1];
    if (showDialog({ title, message, buttons: [
      { label: cancel?.text ?? 'Cancel', kind: 'cancel', onPress: () => cancel?.onPress?.() },
      { label: action?.text ?? 'OK', kind: action?.style === 'destructive' ? 'destructive' : 'confirm', onPress: () => action?.onPress?.() },
    ] })) return;
    if (window.confirm(text)) action?.onPress?.();
    else cancel?.onPress?.();
  };
  (Alert as unknown as { alert: typeof webAlert }).alert = webAlert;
}
