/**
 * Le Leban brand palette — derived from the official logo.
 * Deep royal blue at edges → vibrant center → light swoosh accent.
 */
export const colors = {
  /** Logo center blue — primary actions, active tabs */
  primary: '#0066b2',
  /** Logo edge / deepest blue — gradients, headers, overlay */
  primaryDeep: '#004a8d',
  /** Same as primary; explicit token for gradients */
  primaryMid: '#0066b2',
  /** Logo inner highlight / swoosh */
  primaryLight: '#3399ff',
  /** Logo outer vignette — deepest navy for nav rail, dark backgrounds */
  primaryNavy: '#002d5a',
  /** Soft sky accent for chips and secondary highlights */
  accent: '#93c5fd',
  accentSoft: '#dbeafe',
  background: '#ffffff',
  /** App canvas — faint blue wash like logo surround */
  surfaceTint: '#e8f2fa',
  surfaceElevated: '#ffffff',
  textPrimary: '#0f2744',
  textSecondary: '#5b6b7c',
  textOnPrimary: '#ffffff',
  border: '#c5d9eb',
  borderSoft: '#dbeafe',
  overlay: 'rgba(0, 74, 141, 0.45)',
  /** Luminous glow — logo center zone radiance */
  glow: 'rgba(51, 153, 255, 0.15)',
} as const;

export const gradients = {
  /** Logo radial feel: deep → vibrant center */
  primary: [colors.primaryMid, colors.primaryDeep] as const,
  /** Lighter CTA / add buttons */
  primarySoft: [colors.primaryLight, colors.primaryMid] as const,
  /** Full-screen hero (login, splash) */
  hero: [colors.primaryDeep, colors.primaryMid, colors.primaryLight] as const,
  surface: [colors.surfaceTint, colors.background] as const,
  /** Category nav rail — logo outer edge depth */
  navRail: [colors.primaryNavy, colors.primaryDeep] as const,
  /** Order strip — logo deep horizon */
  strip: [colors.primaryDeep, colors.primaryNavy] as const,
};

export const brand = {
  name: 'Le Leban',
  tagline: 'Restaurant POS',
} as const;
