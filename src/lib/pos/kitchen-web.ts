import { useEffect } from 'react';
import { Platform } from 'react-native';
import { colors } from './brand';

const STYLE_ID = 'kitchen-web-polish';

/**
 * The browser's own parts, styled while the kitchen is open (task 221):
 * - A keyboard focus ring. It appears only for keyboard use, never on a
 *   click or tap. It is drawn inside the control (a blue line with a white
 *   gap), so a card that clips its rows never cuts it off and it shows on a
 *   blue button too. A text field rings its whole box. The app's global reset
 *   removes every outline, so the rule starts with :root to outrank it.
 * - A blue caret and a light-blue text selection.
 * - The phone browser's top bar in the kitchen's canvas colour.
 */
const css = `
:root [tabindex]:focus-visible:not(input):not(textarea), :root button:focus-visible { outline: 2px solid ${colors.primary} !important; outline-offset: -2px !important; box-shadow: inset 0 0 0 4px ${colors.surfaceElevated} !important; }
div:has(> input:focus-visible), div:has(> textarea:focus-visible) { outline: 2px solid ${colors.primary}; outline-offset: -1px; }
input, textarea { caret-color: ${colors.primary}; }
::selection { background-color: ${colors.accentSoft}; color: ${colors.textPrimary}; }
`;

export function useKitchenWebPolish(): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const before = meta?.content ?? null;
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = colors.kitchenCanvas;
    const added = before === null;
    return () => {
      style.remove();
      if (!meta) return;
      if (added) meta.remove(); else meta.content = before ?? '';
    };
  }, []);
}

/** Sets the browser tab's title, as "Send · Le Laban Kitchen". */
export function useKitchenTitle(name: string | null): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !name) return;
    document.title = `${name} · Le Laban Kitchen`;
  }, [name]);
}
