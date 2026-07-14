/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm maroon — the "motherly Indian home" brand primary.
        brand: {
          50: '#fbf3f3',
          100: '#f6e3e3',
          200: '#ecc1c1',
          300: '#de9797',
          400: '#cc6868',
          500: '#b94848',
          600: '#9d3535',
          700: '#7d2727',
          800: '#5e2020',
          900: '#4f0f0f',
          950: '#2e0606',
        },
        // Cream backgrounds.
        cream: {
          50: '#fdfbf5',
          100: '#f7f2e7',
          200: '#efe6cf',
          300: '#e4d4ac',
          400: '#d4bd87',
        },
        // Gold accent.
        gold: {
          50: '#fdf8ec',
          100: '#faedca',
          200: '#f4d890',
          300: '#ecc15a',
          400: '#e0a72f',
          500: '#c9973f',
          600: '#a87320',
          700: '#85581d',
          800: '#6e471f',
          900: '#5d3c1e',
        },
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Poppins', 'system-ui', 'sans-serif'],
        devanagari: ['"Noto Sans Devanagari"', '"Cormorant Garamond"', 'serif'],
      },
      boxShadow: {
        // Soft, mostly-neutral card shadow (modern food-app idiom).
        card: '0 1px 2px rgba(0, 0, 0, 0.04), 0 6px 16px -8px rgba(0, 0, 0, 0.10)',
        // The sticky bottom cart bar.
        bar: '0 -4px 20px -8px rgba(0, 0, 0, 0.18)',
        // The slide-up cart sheet.
        sheet: '0 -8px 32px -12px rgba(0, 0, 0, 0.18)',
        // A slightly stronger lift for sticky/CTA elements.
        lift: '0 4px 16px -6px rgba(0, 0, 0, 0.16)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'fade-up': 'fade-up 0.35s ease-out both',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        shimmer: 'shimmer 1.4s infinite',
      },
    },
  },
  plugins: [],
}