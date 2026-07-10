/**
 * Receipt formatting configuration for Le Leban POS.
 * All layout, address, and feature flags live here.
 */

// ─── Feature Flags ────────────────────────────────────────────────────────────

/**
 * Set to true once GST registration is obtained.
 * When false: GSTIN, FSSAI, GST breakdown, SGST, CGST are all hidden.
 */
export const SHOW_GST_INFORMATION = false;

// ─── Restaurant Information ───────────────────────────────────────────────────

export const RECEIPT_CONFIG = {
  restaurantName: 'LE LEBAN',
  tagline: '',           // e.g. 'DESSERT BAR' — leave blank to omit
  addressLine1: 'No. 13, Balaji Nagar Main Road',
  addressLine2: 'Kolathur',
  addressLine3: 'Chennai - 600099',
  phone: 'PH: 9003301123',
  gstin: 'GSTIN: XXXXXXXXXXXX',        // shown only when SHOW_GST_INFORMATION = true
  fssai: 'FSSAI: XXXXXXXXXXXXXXX',     // shown only when SHOW_GST_INFORMATION = true
  cashierLabel: 'Biller',
  footerLine1: 'Thank You..!! & Visit Again..!!',
  footerLine2: 'Powered by Grovit POS',
} as const;

/** Characters per line for 80 mm paper (standard Font A is 48, switch to 32 for 58 mm). */
export const PAPER_WIDTH = 48;
