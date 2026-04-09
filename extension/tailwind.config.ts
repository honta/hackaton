import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        widget: '0 20px 48px rgba(18, 24, 38, 0.18)',
      },
      colors: {
        lava: {
          50: '#fff5ef',
          100: '#ffe7d7',
          200: '#ffc4a1',
          300: '#ff9b63',
          400: '#ff6e2d',
          500: '#fc5200',
          600: '#d84600',
          700: '#ac3604',
          800: '#8a2d0b',
          900: '#71280d',
        },
        slateglass: '#132033',
      },
    },
  },
  plugins: [],
};

export default config;
