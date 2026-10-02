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
