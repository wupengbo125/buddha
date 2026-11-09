// 外观主题（跟随系统 / 浅 / 深）的纯逻辑：localStorage 读写 + <html data-theme> 应用。
// 与 settings/storage 一致，key 由 lib/brand.ts 的 storageNamespace 派生，禁止在别处硬编码前缀。
// 无顶层浏览器访问，可同时被服务端组件（layout 内联脚本取 key）与客户端组件引用。

import { storageNamespace } from './brand';

export type Theme = 'system' | 'light' | 'dark';

export const THEME_KEY = `${storageNamespace}:theme`;

const VALID: readonly string[] = ['system', 'light', 'dark'];

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && VALID.includes(value);
}

/** 读取持久化主题；未设置 / 非法值 / 存储异常时回退到 'system'。SSR 安全。 */
export function readTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    return isTheme(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

/** 持久化主题。SSR 安全，忽略隐私模式 / 配额错误。 */
export function saveTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* 忽略配额 / 隐私模式错误 */
  }
}

/**
 * 应用主题到 <html data-theme>：
 * - 'system' 删除属性，交给 CSS 的 prefers-color-scheme 媒体查询；
 * - 'light' / 'dark' 显式设置，优先级高于媒体查询（iOS PWA standalone 手动切换靠它生效）。
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

/** 解析最终生效的明暗：'system' 借助 matchMedia，其余原样返回。供系统主题切换补正使用。 */
export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}
