import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0F172A',
        surface: '#1E293B',
        muted: '#272F42',
        border: '#475569',
        accent: '#22C55E',
        'accent-hover': '#16A34A',
        foreground: '#F8FAFC',
        'text-muted': '#94A3B8',
        destructive: '#EF4444',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
