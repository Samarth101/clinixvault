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
        sky: {
          serene: "#38BDF8",
          mist: "#E0F2FE",
          light: "#BAE6FD",
        },
        clinical: {
          blue: "#2563EB",
          vibrant: "#3B82F6",
          dark: "#1D4ED8",
          navy: "#0F172A",
          midnight: "#0B132B",
          surface: "#F8FAFC",
        },
        accent: {
          mint: "#10B981",
          lavender: "#8B5CF6",
          amber: "#F59E0B",
          rose: "#F43F5E",
        }
      },
      borderRadius: {
        '28': '28px',
        '20': '20px',
        '32': '32px',
      },
      boxShadow: {
        'diffuse': '0 20px 50px -12px rgba(15, 23, 42, 0.08), 0 8px 24px -4px rgba(15, 23, 42, 0.04)',
        'diffuse-lg': '0 30px 60px -15px rgba(37, 99, 235, 0.12), 0 12px 30px -6px rgba(15, 23, 42, 0.06)',
        'pill': '0 10px 30px -5px rgba(15, 23, 42, 0.08), inset 0 1px 1px rgba(255, 255, 255, 0.9)',
        'glow-blue': '0 0 25px -3px rgba(59, 130, 246, 0.35)',
        'glow-mint': '0 0 25px -3px rgba(16, 185, 129, 0.35)',
        'glow-dark': '0 0 30px -5px rgba(37, 99, 235, 0.25)',
      },
      fontFamily: {
        display: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        slack: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        sans: [
          'Inter',
          'Fira Sans',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      backgroundImage: {
        'hatch-pattern': 'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.15) 6px, transparent 6px, transparent 12px)',
        'hatch-pattern-dark': 'repeating-linear-gradient(45deg, rgba(15, 23, 42, 0.06), rgba(15, 23, 42, 0.06) 6px, transparent 6px, transparent 12px)',
        'hatch-pattern-blue': 'repeating-linear-gradient(45deg, rgba(37, 99, 235, 0.12), rgba(37, 99, 235, 0.12) 6px, transparent 6px, transparent 12px)',
        'mesh-glow': 'radial-gradient(at 0% 0%, rgba(56, 189, 248, 0.22) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(139, 92, 246, 0.20) 0px, transparent 50%), radial-gradient(at 50% 100%, rgba(37, 99, 235, 0.18) 0px, transparent 60%)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseSlow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        wave: {
          '0%, 100%': { transform: 'scaleY(0.3)' },
          '50%': { transform: 'scaleY(1)' },
        }
      },
      animation: {
        'shimmer': 'shimmer 2.5s infinite linear',
        'pulse-slow': 'pulseSlow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
