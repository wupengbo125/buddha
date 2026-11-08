import type { Config } from 'tailwindcss';

// 禅意配色：宣纸底、墨色字、檀木/赭石单一强调色，金色极少量点缀，细发丝线。
// 取 apple-design.md 的原则（低密度、大留白、UI 退让、字阶克制、44px 触控、scale(0.95) 按压），换色系。
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#f6f4ec', // 宣纸底
        surface: '#fbf9f2',
        ink: '#3a3327', // 墨色字
        'ink-soft': '#6b6151',
        muted: '#8c8272',
        line: 'rgba(58, 51, 39, 0.10)', // 细发丝线
        accent: '#8a5a3b', // 檀木 / 赭石（唯一强调色）
        'accent-deep': '#6f4630',
        'accent-soft': '#ece0cd',
        gold: '#b08d4f', // 金色，极少量点缀
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
