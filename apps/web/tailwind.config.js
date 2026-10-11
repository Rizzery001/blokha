/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { display: ['"Nunito"', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      keyframes: {
        pop: { '0%': { transform: 'scale(0.6)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        shake: {
          '0%,100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-18deg) scale(1.1)' },
          '75%': { transform: 'rotate(18deg) scale(1.1)' },
        },
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgba(255,214,10,0.8)' }, '100%': { boxShadow: '0 0 0 10px rgba(255,214,10,0)' } },
      },
      animation: { pop: 'pop 200ms ease-out', shake: 'shake 500ms ease-in-out', pulseRing: 'pulseRing 1s ease-out infinite' },
    },
  },
  plugins: [],
};
