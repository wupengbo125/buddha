import type { Config } from 'tailwindcss';

// 禅意配色：宣纸底、墨色字、檀木/赭石单一强调色，金色极少量点缀，细发丝线。
// 取 apple-design.md 的原则（低密度、大留白、UI 退让、字阶克制、44px 触控、scale(0.95) 按压），换色系。
// 具体色值全部由 app/globals.css 的 CSS 变量提供（浅/深两套 + color-scheme），这里只引用变量：
// 用 rgb(var(--c-x) / <alpha-value>) 形式，保证 bg-ink/75、bg-bg/95、border-accent/40 这类
// 透明度修饰符在深色模式下依然生效；line 是带 alpha 的完整色，单独用 var() 即可。
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        'ink-soft': 'rgb(var(--c-ink-soft) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        line: 'var(--c-line)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-deep': 'rgb(var(--c-accent-deep) / <alpha-value>)',
        'accent-soft': 'rgb(var(--c-accent-soft) / <alpha-value>)',
        gold: 'rgb(var(--c-gold) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
