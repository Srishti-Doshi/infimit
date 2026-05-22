import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';
import animate from 'tailwindcss-animate';

/**
 * Tailwind configuration — Infimit design system.
 *
 * All colors are wired via CSS variables (raw `R G B` triples) so that adding
 * dark mode in Phase 2 is a single CSS-variable swap. Tokens are accessed via
 * semantic Tailwind utilities, never by hex literal.
 *
 * Token definitions live in `src/styles/tailwind.css`.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          red: {
            50: 'rgb(var(--brand-red-50) / <alpha-value>)',
            100: 'rgb(var(--brand-red-100) / <alpha-value>)',
            500: 'rgb(var(--brand-red-500) / <alpha-value>)',
            600: 'rgb(var(--brand-red-600) / <alpha-value>)',
            700: 'rgb(var(--brand-red-700) / <alpha-value>)',
          },
        },
        ink: {
          primary: 'rgb(var(--ink-primary) / <alpha-value>)',
          secondary: 'rgb(var(--ink-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--ink-tertiary) / <alpha-value>)',
          inverse: 'rgb(var(--ink-inverse) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--surface-default) / <alpha-value>)',
          subtle: 'rgb(var(--surface-subtle) / <alpha-value>)',
          'rose-tint': 'rgb(var(--surface-rose-tint) / <alpha-value>)',
          'blue-tint': 'rgb(var(--surface-blue-tint) / <alpha-value>)',
          inverse: 'rgb(var(--surface-inverse) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--line-default) / <alpha-value>)',
          strong: 'rgb(var(--line-strong) / <alpha-value>)',
        },
        status: {
          'success-bg': 'rgb(var(--status-success-bg) / <alpha-value>)',
          'success-text': 'rgb(var(--status-success-text) / <alpha-value>)',
          'warning-bg': 'rgb(var(--status-warning-bg) / <alpha-value>)',
          'warning-text': 'rgb(var(--status-warning-text) / <alpha-value>)',
          'error-bg': 'rgb(var(--status-error-bg) / <alpha-value>)',
          'error-text': 'rgb(var(--status-error-text) / <alpha-value>)',
          'info-bg': 'rgb(var(--status-info-bg) / <alpha-value>)',
          'info-text': 'rgb(var(--status-info-text) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['"Fraunces Variable"', 'Georgia', '"Times New Roman"', 'serif'],
        sans: ['"Inter Variable"', ...defaultTheme.fontFamily.sans],
      },
      fontSize: {
        // Body / UI sizes — fixed, never fluid. Body text fluidity hurts readability.
        'body-xs': ['0.75rem', { lineHeight: '1rem' }],
        'body-sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'body-base': ['1rem', { lineHeight: '1.5rem' }],
        'body-lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'body-xl': ['1.25rem', { lineHeight: '1.75rem' }],
        // Display / headline sizes — fluid via clamp() between mobile + ultrawide.
        'display-sm': [
          'clamp(1.5rem, 2vw + 0.5rem, 2rem)',
          { lineHeight: '1.2', letterSpacing: '-0.01em' },
        ],
        'display-md': [
          'clamp(1.875rem, 3vw + 0.5rem, 2.5rem)',
          { lineHeight: '1.15', letterSpacing: '-0.015em' },
        ],
        'display-lg': [
          'clamp(2.25rem, 4vw + 0.5rem, 3.5rem)',
          { lineHeight: '1.1', letterSpacing: '-0.02em' },
        ],
        'display-xl': [
          'clamp(2.75rem, 5vw + 0.5rem, 4.5rem)',
          { lineHeight: '1.05', letterSpacing: '-0.025em' },
        ],
        'display-2xl': [
          'clamp(3.5rem, 6vw + 0.5rem, 6rem)',
          { lineHeight: '1', letterSpacing: '-0.03em' },
        ],
      },
      borderRadius: {
        none: '0',
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '24px',
        full: '9999px',
      },
      screens: {
        '3xl': '1920px',
        '4xl': '2560px',
      },
      maxWidth: {
        'content-narrow': '36rem',
        'content-default': '72rem',
        'content-wide': '88rem',
      },
      boxShadow: {
        'elev-1': '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
        'elev-2': '0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
        'elev-3': '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04)',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      transitionTimingFunction: {
        'soft-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        ticker: 'ticker 50s linear infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
