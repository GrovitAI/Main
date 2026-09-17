import { Component, createElement, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { Alert, AppRegistry, Platform, ScrollView, Text, View } from 'react-native';

import { colors } from './brand';

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;
type ExceptionsManagerShape = { handleException: (error: unknown, isFatal: boolean) => void };

type ErrorUtilsShape = {
  getGlobalHandler: () => GlobalErrorHandler;
  setGlobalHandler: (handler: GlobalErrorHandler) => void;
};

type GuardedGlobal = { ErrorUtils?: ErrorUtilsShape };

type FatalReport = { message: string; stack: string; source: string };

/** The name Expo registers the app under; native asks for it once the bundle has loaded. */
const ROOT_APP_KEY = 'main';
/** An alert raised before the first window exists never shows on iOS, so it waits. */
const ALERT_DELAY_MS = 1500;
/** How much of the stack fits in an alert without pushing the message off screen. */
const ALERT_STACK_CHARS = 500;
/** How far back to look for errors the native side logged on earlier launches. */
const NATIVE_LOG_MAX_AGE_MS = 60 * 60 * 1000;

let firstReport: FatalReport | null = null;

function describe(error: unknown, source: string): FatalReport {
  if (error instanceof Error) {
    // The stack repeats the message before its first frame; keep the frames only.
    const stack = error.stack ?? '';
    const firstFrame = stack.indexOf('\n    at ');
    return { message: `${error.name}: ${error.message}`, stack: firstFrame >= 0 ? stack.slice(firstFrame + 1) : '', source };
  }
  return { message: String(error), stack: '', source };
}

/** Which bundle is running: the one shipped in the build, or an over-the-air update. */
function describeBundle(): string {
  try {
    const updates = require('expo-updates') as typeof import('expo-updates');
    if (updates.isEmbeddedLaunch) return 'bundle: built in';
    return `bundle: update ${(updates.updateId ?? 'unknown').slice(0, 8)}`;
  } catch {
    return 'bundle: unknown';
  }
}

/** Errors the native side wrote down on earlier launches, newest last. */
async function readNativeErrorLog(): Promise<string> {
  try {
    const updates = require('expo-updates') as typeof import('expo-updates');
    const entries = await updates.readLogEntriesAsync(NATIVE_LOG_MAX_AGE_MS);
    const errors = entries.filter((entry) => entry.level === 'error' || entry.level === 'fatal');
    if (errors.length === 0) return 'No earlier errors were logged.';
    return errors
      .slice(-6)
      .map((entry) => `${new Date(entry.timestamp).toLocaleTimeString()} ${entry.code}: ${entry.message}`)
      .join('\n\n');
  } catch (err) {
    return `The earlier log could not be read (${err instanceof Error ? err.message : String(err)}).`;
  }
}

/**
 * Shown in place of the app when it could not start. Built with createElement
 * and inline styles on purpose: the styling layer and the router are among the
 * things that may have failed, so this screen depends on neither.
 */
function StartupErrorScreen(): ReactElement {
  const [nativeLog, setNativeLog] = useState('Reading the earlier log…');

  useEffect(() => {
    let active = true;
    void readNativeErrorLog().then((text) => {
      if (active) setNativeLog(text);
    });
    return () => {
      active = false;
    };
  }, []);

  const report = firstReport;
  const line = (key: string, text: string, size: number, bold: boolean): ReactElement =>
    createElement(
      Text,
      { key, selectable: true, style: { color: colors.textOnPrimary, fontSize: size, fontWeight: bold ? '700' : '400', marginBottom: 12 } },
      text,
    );

  return createElement(
    View,
    { style: { flex: 1, backgroundColor: colors.primaryDeep, paddingTop: 64, paddingHorizontal: 20 } },
    createElement(ScrollView, { contentContainerStyle: { paddingBottom: 48 } }, [
      line('title', 'Grovit could not start', 22, true),
      line('hint', 'Please take a screenshot of this screen and send it to support.', 14, false),
      line('message', report?.message ?? 'No error was captured.', 16, true),
      line('source', `${report?.source ?? 'unknown source'} · ${describeBundle()}`, 12, false),
      line('stack', report?.stack ?? '', 11, false),
      line('log-title', 'Earlier errors on this phone', 14, true),
      line('log', nativeLog, 11, false),
    ]),
  );
}

/**
 * Wraps the whole app. A render or effect error that nothing below caught
 * would make React take the entire screen down; caught here, it becomes the
 * error screen instead.
 */
class StartupErrorBoundary extends Component<{ children?: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(error: unknown): { failed: boolean } {
    const report = describe(error, 'caught while rendering');
    console.error('[Grovit] Fatal error', report.source, report.message, report.stack);
    if (!firstReport) firstReport = report;
    return { failed: true };
  }

  render(): ReactNode {
    return this.state.failed ? createElement(StartupErrorScreen) : this.props.children;
  }
}

function showFatal(error: unknown, source: string): void {
  const report = describe(error, source);
  console.error('[Grovit] Fatal error', report.source, report.message, report.stack);
  // The first error is the cause; the ones after it are usually its fallout
  // (a route that failed to load leaves the app unregistered, and so on).
  if (firstReport) return;
  firstReport = report;

  // If the error stopped the app from registering itself, native is about to
  // ask for it: hand over the error screen instead of leaving a blank window.
  if (!AppRegistry.getAppKeys().includes(ROOT_APP_KEY)) {
    AppRegistry.registerComponent(ROOT_APP_KEY, () => StartupErrorScreen);
  }

  setTimeout(() => {
    Alert.alert('Grovit hit an error', `${report.message}\n\n${report.source} · ${describeBundle()}\n\n${report.stack.slice(0, ALERT_STACK_CHARS)}`);
  }, ALERT_DELAY_MS);
}

/**
 * In an installed app a fatal JavaScript error closes the app at once, and the
 * phone's crash report does not carry the message, so there is nothing to act
 * on. This keeps the app open and shows the message instead. Two routes lead
 * to a native crash and both are covered: errors React Native reports through
 * ErrorUtils (module loading, timers, event handlers), and errors React could
 * not recover from while rendering, which React Native's exception manager
 * passes straight to native. Development keeps the red box, and the web is
 * untouched because the browser already reports errors in its console.
 *
 * Must be imported before `expo-router/entry` so it is in place while the
 * route files load.
 */
export function installStartupErrorGuard(): void {
  if (Platform.OS === 'web' || __DEV__) return;
  const guarded = globalThis as GuardedGlobal;

  const errorUtils = guarded.ErrorUtils;
  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      if (!isFatal) {
        previous(error, isFatal);
        return;
      }
      showFatal(error, 'caught by ErrorUtils');
    });
  }

  AppRegistry.setWrapperComponentProvider(() => StartupErrorBoundary);

  // Backstop for anything the boundary above cannot catch.
  // The renderer looks this method up on the shared object each time it reports
  // an error, so replacing it here is enough. The native hook it calls into
  // (RN$handleException) is read-only and cannot be wrapped directly.
  const exceptionsManager = (
    require('react-native/Libraries/Core/ExceptionsManager') as { default: ExceptionsManagerShape }
  ).default;
  const reportToNative = exceptionsManager.handleException;
  exceptionsManager.handleException = (error, isFatal) => {
    if (isFatal) {
      showFatal(error, 'caught while rendering');
      return;
    }
    reportToNative(error, isFatal);
  };
}

installStartupErrorGuard();
