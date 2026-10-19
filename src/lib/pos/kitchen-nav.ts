import { router } from 'expo-router';
import { KITCHEN_HOME } from './tab-config';
import { confirmAction } from './dialogs';

/** What an open form with unsaved typing says before it is left (task 221). */
type LeaveQuestion = { title: string; message: string; release: () => void };
let leaveCheck: (() => LeaveQuestion | null) | null = null;

/** A form registers its question while it is open; the returned function removes it. */
export function setLeaveCheck(check: () => LeaveQuestion | null): () => void {
  leaveCheck = check;
  return () => { if (leaveCheck === check) leaveCheck = null; };
}

/**
 * Task 269: whether the kitchen's tabs have been on screen. A page opened by a link or a reload has
 * the tabs beneath it only as a placeholder that opens on its first tab (Analytics), so stepping
 * back from it went there; until the tabs have been seen, leaving goes to Home instead.
 */
let kitchenTabsShown = false;
export function markKitchenTabsShown(): void { kitchenTabsShown = true; }

function leave(): void {
  if (kitchenTabsShown && router.canGoBack()) router.back();
  else router.replace(KITCHEN_HOME as never);
}

/**
 * Leaves a kitchen form or detail page. Normally that is one step back; when
 * the page was opened by a link or a reload there is nothing behind it, and
 * "back" would fall out of the kitchen into the main app, so go home instead.
 * A form with unsaved typing asks first.
 */
export function backToKitchen(): void {
  const question = leaveCheck?.() ?? null;
  if (!question) { leave(); return; }
  confirmAction(question.title, question.message, 'Leave', () => { question.release(); leave(); });
}
