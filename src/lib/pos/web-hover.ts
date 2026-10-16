import { useEffect } from 'react';
import { Platform } from 'react-native';
import { colors } from './brand';

const STYLE_ID = 'app-hover';
const clickable = ':is([role="button"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [role="menuitem"], [role="option"], [role="link"], a[href], [tabindex="0"])';
const enabled = `${clickable}:not(input):not(textarea):not([aria-disabled="true"])`;
/**
 * Already chosen: a selected tab, pill, segment, row or option (task 227). Clicking it changes
 * nothing, so it takes no hover. Tick boxes and switches still do, as a click toggles them.
 */
const chosen = ':is([aria-selected="true"], [role="radio"][aria-checked="true"], [aria-pressed="true"], [aria-current="page"])';
/**
 * The controls the shared tint is drawn on. Left out: controls with their own hover, items of a
 * container whose items draw their own, and wrappers that hold other controls or fields (a
 * modal's backdrop or body, a card around buttons), which would otherwise light up as a whole
 * when the pointer is over one of the things inside them.
 */
const tinted = `${enabled}:not(${chosen}):not([class*="hover:"]):not([data-hover]):not([data-hover="scope"] *):not(:has(${clickable}, input, textarea))`;
const fade = 'opacity 140ms ease-out';

/**
 * A hover highlight on everything clickable, app-wide (tasks 225 and 226). With a mouse, a soft
 * tint fades in over the control's own background, under its text and icons, inside its rounded
 * corners, and covering exactly the area that takes the click. Touch screens never see it.
 *
 * It stays out of the way of controls that draw their own hover:
 * - a NativeWind `hover:` class on the element itself (these now ease in too);
 * - `ownHover` (data-hover="own"), for Pressables whose style function reads `hovered`;
 * - `hoverScope` (data-hover="scope") on a container, such as a dark sidebar, whose items
 *   all draw their own hover;
 * - `hoverFace` on a control whose drawn face is smaller than its finger target (a 36 px pill in a
 *   44 px target): the tint goes on the face marked `hoverFaceMark`, not on the whole target;
 * - `hoverLink` on a text link, which underlines instead.
 * A control that is already selected takes no hover at all (`chosen`).
 */
const css = `
@media (hover: hover) and (pointer: fine) {
  ${tinted}, [data-hover="face"] [data-hover-face] { isolation: isolate; }
  ${tinted}::after, [data-hover="face"] [data-hover-face]::after {
    content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: -1;
    background-color: ${colors.hoverTint}; opacity: 0; transition: ${fade};
  }
  ${tinted}:hover::after, [data-hover="face"]:not([aria-disabled="true"]):not(${chosen}):hover [data-hover-face]::after { opacity: 1; }
  ${enabled}[class*="hover:"] { transition: background-color 140ms ease-out, border-color 140ms ease-out, color 140ms ease-out; }
  [data-hover="link"]:not([aria-disabled="true"]):hover * { text-decoration-line: underline; }
}
@media (prefers-reduced-motion: reduce) {
  ${tinted}::after, [data-hover="face"] [data-hover-face]::after, ${enabled}[class*="hover:"] { transition: none; }
}
`;

/** Spread on a Pressable that draws its own hover from its `hovered` state. */
export const ownHover: object = Platform.OS === 'web' ? { dataSet: { hover: 'own' } } : {};
/** Spread on a container whose clickable items all draw their own hover. */
export const hoverScope: object = Platform.OS === 'web' ? { dataSet: { hover: 'scope' } } : {};
/** Spread on a Pressable whose drawn face is smaller than its target; mark the face with `hoverFaceMark`. */
export const hoverFace: object = Platform.OS === 'web' ? { dataSet: { hover: 'face' } } : {};
export const hoverFaceMark: object = Platform.OS === 'web' ? { dataSet: { hoverFace: '' } } : {};
/** Spread on a text link: it underlines on hover instead of taking a tint. */
export const hoverLink: object = Platform.OS === 'web' ? { dataSet: { hover: 'link' } } : {};

/** Adds the hover rule while the app is open in a browser. */
export function useWebHover(): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);
}
