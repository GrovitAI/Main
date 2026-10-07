import { router } from 'expo-router';
import { KITCHEN_HOME } from './tab-config';

/**
 * Leaves a kitchen form or detail page. Normally that is one step back; when
 * the page was opened by a link or a reload there is nothing behind it, and
 * "back" would fall out of the kitchen into the main app, so go home instead.
 */
export function backToKitchen(): void {
  if (router.canGoBack()) router.back();
  else router.replace(KITCHEN_HOME as never);
}
