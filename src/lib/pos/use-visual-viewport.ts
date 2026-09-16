import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

export type VisualViewport = {
  /** Height of the part of the page the user can actually see, in px. */
  height: number;
  /** How far the visible part sits below the top of the page, in px. */
  offsetTop: number;
  /** Whether a software keyboard is taking up the difference. */
  keyboardOpen: boolean;
};

/** A keyboard is assumed once the visible height is this much shorter than the page. */
const KEYBOARD_THRESHOLD_PX = 100;

function readWebViewport(fallbackHeight: number): VisualViewport {
  if (typeof window === 'undefined' || !window.visualViewport) {
    return { height: fallbackHeight, offsetTop: 0, keyboardOpen: false };
  }
  const { height, offsetTop } = window.visualViewport;
  return {
    height: Math.round(height),
    offsetTop: Math.round(offsetTop),
    keyboardOpen: window.innerHeight - height > KEYBOARD_THRESHOLD_PX,
  };
}

/**
 * The part of the page the user can see. On a phone browser the on-screen
 * keyboard covers the lower part of the page without changing the page's
 * own height, so anything sized or anchored to the window ends up behind
 * it. This follows the browser's visual viewport instead, which shrinks with
 * the keyboard. On native the keyboard is handled elsewhere, so this is
 * simply the window height.
 */
export function useVisualViewport(): VisualViewport {
  const { height: windowHeight } = useWindowDimensions();
  const [viewport, setViewport] = useState<VisualViewport>(() =>
    Platform.OS === 'web' ? readWebViewport(windowHeight) : { height: windowHeight, offsetTop: 0, keyboardOpen: false },
  );

  useEffect(() => {
    if (Platform.OS !== 'web') {
      setViewport({ height: windowHeight, offsetTop: 0, keyboardOpen: false });
      return;
    }
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const update = () => setViewport(readWebViewport(windowHeight));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [windowHeight]);

  return viewport;
}
