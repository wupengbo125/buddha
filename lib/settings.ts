// 字幕时长 / 时区 / 点击音效全局总开关等可持久化设置的常量与 localStorage 读写

import { storageNamespace } from './brand';

export const CAPTION_MIN_MS = 200;
export const CAPTION_MAX_MS = 10000;
export const CAPTION_DEFAULT_MS = 1200;
export const DEFAULT_TIMEZONE = 'Asia/Shanghai';

export interface Settings {
  captionMs: number;
  timeZone: string;
  soundEnabled: boolean; // 全局总开关：false 时任何计数器都不响（一键全关）
}

const SETTINGS_KEY = `${storageNamespace}:settings`;

export function clampCaptionMs(value: number): number {
  if (!Number.isFinite(value)) return CAPTION_DEFAULT_MS;
  return Math.min(CAPTION_MAX_MS, Math.max(CAPTION_MIN_MS, Math.round(value)));
}

export function defaultSettings(): Settings {
  return { captionMs: CAPTION_DEFAULT_MS, timeZone: DEFAULT_TIMEZONE, soundEnabled: true };
}

export function loadSettings(): Settings {
  if (typeof window === 'undefined') return defaultSettings();
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      captionMs: clampCaptionMs(Number(parsed.captionMs)),
      timeZone: typeof parsed.timeZone === 'string' && parsed.timeZone ? parsed.timeZone : DEFAULT_TIMEZONE,
      // 老数据缺字段时默认开；仅显式 false 才关。
      soundEnabled: parsed.soundEnabled !== false,
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: Settings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* 忽略配额 / 隐私模式错误 */
  }
}
