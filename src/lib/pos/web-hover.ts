import { useEffect } from 'react';
import { Platform } from 'react-native';
import { colors } from './brand';

const STYLE_ID = 'app-hover';
const tint = `linear-gradient(${colors.hoverTint}, ${colors.hoverTint})`;
const clickable = ':is([role="button"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [role="menuitem"], [role="option"], [role="link"], a[href], [tabindex="0"]):not(input):not(textarea):not([aria-disabled="true"])';

/**
 * A hover highlight on everything clickable, app-wide (task 225). With a mouse, a soft tint is laid
 * over the control's own background, so it works on white, tinted and blue controls alike and
 * keeps their rounded corners. Touch screens never see it.
 *
 * It stays out of the way of controls that draw their own hover:
 * - a NativeWind `hover:` class on the element itself;
 * - `ownHover` (data-hover="own"), for Pressables whose style function reads `hovered`;
 * - `hoverScope` (data-hover="scope") on a container, such as a dark sidebar, whose items
 *   all draw their own hover;
 * - `hoverFace` on a control whose drawn face is smaller than its finger target (a 36 px pill in a
 *   44 px target): the tint goes on the face marked `hoverFaceMark`, not on the whole target;
 * - `hoverLink` on a text link, which underlines instead.
 */
const css = `
@media (hover: hover) and (pointer: fine) {
  ${clickable}:not([class*="hover:"]):not([data-hover]):not([data-hover="scope"] *):hover { background-image: ${tint}; }
  [data-hover="face"]:not([aria-disabled="true"]):hover [data-hover-face] { background-image: ${tint}; }
  [data-hover="link"]:not([aria-disabled="true"]):hover * { text-decoration-line: underline; }
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
