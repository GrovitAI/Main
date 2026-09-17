import { Alert, Platform } from 'react-native';

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;

type ErrorUtilsShape = {
  getGlobalHandler: () => GlobalErrorHandler;
  setGlobalHandler: (handler: GlobalErrorHandler) => void;
};

/** How much of the stack fits in an alert without pushing the message off screen. */
const STACK_PREVIEW_CHARS = 500;

function describe(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) {
    // The stack repeats the message before its first frame; keep the frames only.
    const stack = error.stack ?? '';
    const firstFrame = stack.indexOf('\n    at ');
    return { message: `${error.name}: ${error.message}`, stack: firstFrame >= 0 ? stack.slice(firstFrame + 1) : '' };
  }
  return { message: String(error), stack: '' };
}

/**
 * In an installed app a fatal JavaScript error closes the app at once, and the
 * phone's crash report does not carry the message, so there is nothing to act
 * on. This shows the message in an alert instead, which works even when no
 * screen managed to render. Development keeps the red box, and the web is
 * untouched because the browser already reports errors in its console.
 *
 * Must be imported before `expo-router/entry` so it is in place while the
 * route files load.
 */
export function installStartupErrorGuard(): void {
  if (Platform.OS === 'web' || __DEV__) return;
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils;
  if (!errorUtils) return;

  const previous = errorUtils.getGlobalHandler();
  // The first error is the cause; the ones after it are usually its fallout
  // (a route that failed to load leaves the app unregistered, and so on).
  let alreadyShown = false;
  errorUtils.setGlobalHandler((error, isFatal) => {
    if (!isFatal) {
      previous(error, isFatal);
      return;
    }
    const { message, stack } = describe(error);
    console.error('[Grovit] Fatal error', message, stack);
    if (alreadyShown) return;
    alreadyShown = true;
    Alert.alert('Grovit hit an error', `${message}\n\n${stack.slice(0, STACK_PREVIEW_CHARS)}`);
  });
}

installStartupErrorGuard();
