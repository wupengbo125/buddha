import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#f6f4ec',
        surface: '#fffdf7',
        ink: '#3a3327',
        muted: '#8a8171',
        line: '#e6dfcd',
        accent: '#a9762f',
        'accent-soft': '#f0e4cb',
        danger: '#b4472f',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
