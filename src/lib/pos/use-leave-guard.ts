import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useNavigation } from 'expo-router';
import { confirmAction } from './dialogs';
import { setLeaveCheck } from './kitchen-nav';

/**
 * True once what the person typed differs from how the form started (or from
 * the saved entry it was filled from). `snapshot` is the typed state as text;
 * `startedFrom` changes when the form is refilled, which resets the start.
 */
export function useTypedChanges(snapshot: string, startedFrom: string | null = null): boolean {
  const [baseline, setBaseline] = useState(snapshot);
  const last = useRef(startedFrom);
  useEffect(() => {
    if (last.current === startedFrom) return;
    last.current = startedFrom;
    setBaseline(snapshot);
  }, [startedFrom, snapshot]);
  return useMemo(() => snapshot !== baseline, [snapshot, baseline]);
}

/**
 * Asks before a form with typed entries is left (task 221). Pass false once
 * the entry is saved, so leaving after a save never asks.
 * - The kitchen's own Back (`backToKitchen`) asks on every platform.
 * - On a phone, the back gesture and Android's back button ask too.
 * - In a browser, closing or reloading the tab asks. The browser's own Back
 *   button cannot be held, so it is not covered.
 */
export function useLeaveGuard(dirty: boolean, what = 'What you typed here'): void {
  const navigation = useNavigation();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const message = `${what} will be lost.`;
  useEffect(() => setLeaveCheck(() => (dirtyRef.current
    ? { title: 'Leave without saving?', message, release: () => { dirtyRef.current = false; } }
    : null)), [message]);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    return navigation.addListener('beforeRemove', (event) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      confirmAction('Leave without saving?', message, 'Leave', () => {
        dirtyRef.current = false;
        navigation.dispatch(event.data.action);
      });
    });
  }, [navigation, message]);
  // Task 252: iOS cannot hold a swipe back while it asks, so the page slid away but stayed put.
  // With unsaved typing the swipe is off; the header's Back asks instead.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    navigation.setOptions({ gestureEnabled: !dirty });
  }, [navigation, dirty]);
  useEffect(() => {
    if (Platform.OS !== 'web' || !dirty || typeof window === 'undefined') return;
    const onUnload = (event: BeforeUnloadEvent): void => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);
}
