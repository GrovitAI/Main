import { Alert, Platform } from 'react-native';

/**
 * A message the user must see. react-native-web's Alert.alert is an empty
 * function, so on the web a screen that relies on it says nothing at all;
 * there the browser's own dialog is used instead.
 */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
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
      window.alert(text);
      list[0]?.onPress?.();
      return;
    }
    const action = actions.find((b) => b.style === 'destructive') ?? actions[actions.length - 1];
    if (window.confirm(text)) action?.onPress?.();
    else cancel?.onPress?.();
  };
  (Alert as unknown as { alert: typeof webAlert }).alert = webAlert;
}
