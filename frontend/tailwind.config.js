/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      borderRadius: {
        card: '14px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      colors: {
        primary: {
          DEFAULT: '#1A4D2E',
          foreground: '#FFFFFF'
        },
        secondary: {
          DEFAULT: '#4F6F52',
          foreground: '#FFFFFF'
        },
        accent: {
          DEFAULT: '#E85C0D',
          foreground: '#FFFFFF'
        },
        background: '#F5F7F5',
        surface: '#FFFFFF',
        'text-primary': '#1A1A1A',
        'text-secondary': '#4A4A4A',
        'text-muted': '#71717A',
        border: '#E5E7EB',
        input: '#F5F7F5',
        ring: '#1A4D2E',
        brand: { DEFAULT: '#14532d', 600: '#166534', 50: '#f0fdf4' },
        mint: '#dcfce7',
        canvas: '#f6f8f7',
        line: '#e5e7eb',
        ink: { DEFAULT: '#1f2937', soft: '#64748b' },
        scope1: '#10b981',
        scope2: '#3b82f6',
        scope3: '#8b5cf6',
        total: '#334155',
        biogenic: '#f59e0b',
        chart: {
          '1': '#1A4D2E',
          '2': '#4F6F52',
          '3': '#E85C0D',
          '4': '#F5A623',
          '5': '#8D6F64'
        }
      },
      boxShadow: { card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)' },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['Manrope', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
};