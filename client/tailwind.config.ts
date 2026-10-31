import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
      },
      colors: {
        // All colors are driven by CSS custom properties in tokens.css.
        // Use these Tailwind aliases so no hex is ever hard-coded in components.
        'bg-base':       'var(--bg-base)',
        'bg-surface':    'var(--bg-surface)',
        'bg-surface-2':  'var(--bg-surface-2)',
        'text-primary':  'var(--text-primary)',
        'text-muted':    'var(--text-muted)',
        'accent-lime':   'var(--accent-lime)',
        'accent-violet': 'var(--accent-violet)',
        'accent-violet-deep': 'var(--accent-violet-deep)',
        'danger':        'var(--danger)',
      },
      borderRadius: {
        card:  '20px',
        tile:  '14px',
        chip:  '9999px',
      },
      spacing: {
        // 8px base grid
        'page': '24px',
        'card': '20px',
        'gap':  '16px',
      },
      backdropBlur: {
        glass: '12px',
      },
    },
  },
  plugins: [],
}

export default config
