import { Platform } from 'react-native';

/** The parts of a browser element that a screen's entrance uses. */
export type WebMotionNode = {
  animate: (frames: Record<string, string>[], options: { duration: number; easing: string }) => unknown;
  style: { opacity: string };
};

/** A view's element in a browser, or null on a phone (where Animated runs natively). */
export function webMotionNode(view: unknown): WebMotionNode | null {
  if (Platform.OS !== 'web' || typeof view !== 'object' || view === null) return null;
  const node = view as Partial<WebMotionNode>;
  return typeof node.animate === 'function' && typeof node.style === 'object' ? (node as WebMotionNode) : null;
}

/**
 * Task 291: a screen's entrance in a browser, played by the browser itself. React Native's Animated
 * has no native driver on the web and redrew the whole screen on every frame of a transition;
 * the browser's own animation draws nothing again. `dx` is where it starts, in px.
 */
export function playEntrance(node: WebMotionNode, dx: number, duration: number): void {
  node.animate(
    [{ opacity: '0', transform: `translateX(${dx}px)` }, { opacity: '1', transform: 'translateX(0px)' }],
    { duration, easing: 'cubic-bezier(0.215, 0.61, 0.355, 1)' },
  );
  node.style.opacity = '';
}
