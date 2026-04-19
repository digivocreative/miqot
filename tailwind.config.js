/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        barPulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        ktpScan: {
          '0%, 100%': { top: '0%', opacity: '0' },
          '10%, 90%': { opacity: '1' },
          '50%': { top: 'calc(100% - 2px)', opacity: '1' },
        },
        ktpGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(16, 185, 129, 0)' },
          '50%': { boxShadow: '0 0 0 6px rgba(16, 185, 129, 0.12)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        paketFloat: {
          '0%, 100%': { transform: 'translateY(0) rotate(-2deg)' },
          '50%': { transform: 'translateY(-2px) rotate(2deg)' },
        },
      },
      animation: {
        barPulse: 'barPulse 2s ease-in-out infinite',
        slideUp: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        ktpScan: 'ktpScan 1.8s ease-in-out infinite',
        ktpGlow: 'ktpGlow 1.8s ease-in-out infinite',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
        paketFloat: 'paketFloat 2.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
