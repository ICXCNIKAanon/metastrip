import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: '#09090b',
        surface: '#0f0f17',
        border: '#1e1e2e',
        primary: '#10b981',
        accent: '#06b6d4',
        'risk-critical': '#ef4444',
        'risk-high': '#f97316',
        'risk-medium': '#eab308',
        'risk-safe': '#22c55e',
        'text-primary': '#ffffff',
        'text-secondary': '#8892b0',
        'text-tertiary': '#6b7280',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace'],
      },
      borderRadius: {
        card: '12px',
        button: '10px',
        input: '8px',
      },
    },
  },
  plugins: [],
};

export default config;
