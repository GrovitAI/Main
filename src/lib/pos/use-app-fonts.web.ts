import { useEffect, useState } from 'react';
import { typography } from '@/lib/pos/brand';

let loading: Promise<void> | undefined;

function loadWebFonts(): Promise<void> {
  if (!loading) {
    loading = Promise.all([
      [400, typography.faces.regular],
      [500, typography.faces.medium],
      [600, typography.faces.semibold],
      [700, typography.faces.bold],
    ].map(async ([weight, face]) => {
      const font = new FontFace(typography.family, `url("/fonts/${face}.ttf")`, {
        weight: String(weight),
        style: 'normal',
        display: 'swap',
      });
      await font.load();
      return font;
    })).then(fonts => {
      const fontSet = document.fonts;
      if (!('add' in fontSet) || typeof fontSet.add !== 'function') {
        throw new Error('Font registration is unavailable.');
      }
      for (const font of fonts) fontSet.add(font);
    });
  }
  return loading;
}

/** One local download per weight, with real CSS weight matching on the web. */
export function useAppFonts(): { loaded: boolean; error: Error | null } {
  const [state, setState] = useState<{ loaded: boolean; error: Error | null }>({ loaded: false, error: null });
  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      if (active) setState({ loaded: false, error: new Error('Font loading timed out.') });
    }, 5000);
    loadWebFonts().then(() => {
      if (active) setState({ loaded: true, error: null });
    }).catch(() => {
      if (active) setState({ loaded: false, error: new Error('Unable to load app fonts.') });
    }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); };
  }, []);
  return state;
}
