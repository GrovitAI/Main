/** @type {import('tailwindcss').Config} */
/** Keep in sync with src/lib/pos/brand.ts — Le Leban logo palette */
const lebanColors = {
  primary: '#0066b2',
  'primary-deep': '#004a8d',
  'primary-mid': '#0066b2',
  'primary-light': '#3399ff',
  'primary-navy': '#002d5a',
  accent: '#93c5fd',
  'accent-soft': '#dbeafe',
  background: '#ffffff',
  'surface-tint': '#e8f2fa',
  'surface-elevated': '#ffffff',
  'text-primary': '#0f2744',
  'text-secondary': '#5b6b7c',
  'text-on-primary': '#ffffff',
  border: '#c5d9eb',
  'border-soft': '#dbeafe',
};

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: lebanColors,
      borderRadius: {
        panel: '28px',
      },
      boxShadow: {
        panel: '0 8px 28px rgba(0, 74, 141, 0.12)',
        card: '0 4px 16px rgba(0, 102, 178, 0.08)',
        glow: '0 0 24px rgba(51, 153, 255, 0.25)',
        'glow-sm': '0 0 12px rgba(51, 153, 255, 0.15)',
      },
    },
  },
  plugins: [],
};
