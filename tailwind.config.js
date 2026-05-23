/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#1d4ed8',
        accent: '#93c5fd',
        background: '#ffffff',
        'text-primary': '#111827',
        'text-secondary': '#6b7280',
        border: '#e5e7eb',
      },
    },
  },
  plugins: [],
};
