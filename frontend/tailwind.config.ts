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
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 var(--accent)' },
          '50%': { boxShadow: '0 0 0 12px transparent' },
        },
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(120%)' },
        },
      },
      animation: {
        'fade-up': 'fadeUp 0.45s ease-out both',
        'pulse-glow': 'pulseGlow 2.4s ease-in-out infinite',
        'gradient-shift': 'gradientShift 14s ease-in-out infinite',
        shimmer: 'shimmer 1.4s ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
