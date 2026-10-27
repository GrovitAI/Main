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
  /** The logo image's own square blue: the badge blends only into this exact colour (task 271). */
  logoBlue: '#0250a5',
  /** The light-blue swooshes inside the logo, used as thin arcs beside it. */
  logoSwoosh: '#7cc0ff',
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
  /** Matches the existing POS and Orders workspace canvas. */
  kitchenCanvas: '#f5f8fc',
  /** Quiet flat selection on the Kitchen's blue navigation rail. */
  kitchenSidebarSelected: 'rgba(255, 255, 255, 0.14)',
  /** Existing POS sidebar palette, shared with the kitchen rail. */
  sidebarTop: '#0251b8',
  sidebarMiddle: '#013b8c',
  sidebarBottom: '#012f70',
  sidebarSelectedTop: 'rgba(58, 120, 220, 0.95)',
  sidebarSelectedBottom: 'rgba(35, 95, 190, 0.95)',
  sidebarTextMuted: 'rgba(255, 255, 255, 0.8)',
  sidebarHover: 'rgba(255, 255, 255, 0.08)',
  sidebarDivider: 'rgba(255, 255, 255, 0.12)',
  surfaceElevated: '#ffffff',
  textPrimary: '#0f2744',
  textSecondary: '#5b6b7c',
  textOnPrimary: '#ffffff',
  border: '#c5d9eb',
  borderSoft: '#dbeafe',
  overlay: 'rgba(0, 74, 141, 0.45)',
  /** Luminous glow — logo center zone radiance */
  glow: 'rgba(51, 153, 255, 0.15)',
  /** The soft tint laid over anything clickable under a mouse: primary at 9%, which reads as surfaceTint on white, so it matches the hover:bg-surface-tint controls (tasks 225-226) */
  hoverTint: 'rgba(0, 102, 178, 0.09)',
} as const;

export const gradients = {
  /** Exact incumbent POS sidebar and selected-row treatments. */
  posSidebar: [colors.sidebarTop, colors.sidebarMiddle, colors.sidebarBottom] as const,
  posSidebarSelected: [colors.sidebarSelectedTop, colors.sidebarSelectedBottom] as const,
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
  name: 'Le Laban',
  tagline: 'Restaurant POS',
} as const;

/** Source Sans 3 was selected from the frontend font comparison (task 170). */
export const typography = {
  family: 'SourceSans3',
  faces: {
    regular: 'SourceSans3-Regular',
    medium: 'SourceSans3-Medium',
    semibold: 'SourceSans3-SemiBold',
    bold: 'SourceSans3-Bold',
  },
} as const;

/**
 * Semantic status colours — money in / money out / attention.
 * Kept here so finance and reporting screens never hardcode hex values.
 */
export const semantic = {
  success: '#15803d',
  successSoft: '#dcfce7',
  danger: '#b91c1c',
  dangerSoft: '#fee2e2',
  warning: '#b45309',
  warningSoft: '#fef3c7',
  neutral: '#64748b',
  neutralSoft: '#f1f5f9',
} as const;

/**
 * Chart colours (task 197). Validated with the dataviz six checks on the white
 * card surface: series1–3 pass all-pairs (CVD ΔE 10.7, normal-vision ΔE 15.9,
 * every mark at least 3:1). `previous` is the lighter step of series1 for an
 * earlier period (ordinal ramp, light end 2.22:1). `pending` is the warning
 * status mark; its label always stays in text colour.
 */
/**
 * Initial circles for branches, vendors and staff (task 229). Each pair is a soft fill and its dark
 * text; a name always takes the same pair, so a branch keeps its colour on every screen.
 */
export const avatar = [
  { bg: '#ede9fe', fg: '#5b3fd6' },
  { bg: '#d6f5ee', fg: '#0d7a68' },
  { bg: '#fef3c7', fg: '#92400e' },
  { bg: '#e0f2fe', fg: '#0369a1' },
  { bg: '#fce7f3', fg: '#9d174d' },
  { bg: '#ecfccb', fg: '#3f6212' },
  { bg: '#dbeafe', fg: '#004a8d' },
] as const;

export const chart = {
  /** Le Laban blue: sales, UPI, item revenue. */
  series1: '#0066b2',
  /** Teal: cash. */
  series2: '#14a38b',
  /** Violet: card. */
  series3: '#7a5af5',
  /** The earlier period, a lighter step of series1. */
  previous: '#7ab4e4',
  /** Money not yet collected (status warning). */
  pending: '#d97706',
  /** Hairline gridlines and empty meter tracks. */
  grid: '#e6eef7',
  /** Wash behind the hovered or focused column group. */
  hoverWash: 'rgba(0, 102, 178, 0.06)',
  /** Page canvas behind the cards. */
  canvas: '#f5f8fc',
} as const;
