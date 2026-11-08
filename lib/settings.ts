// 字幕时长 / 时区等可持久化设置的常量与 localStorage 读写

import { storageNamespace } from './brand';

export const CAPTION_MIN_MS = 200;
export const CAPTION_MAX_MS = 10000;
export const CAPTION_DEFAULT_MS = 1200;
export const DEFAULT_TIMEZONE = 'Asia/Shanghai';
export const FLUSH_INTERVAL_MS = 30 * 1000;

export interface Settings {
  captionMs: number;
  timeZone: string;
}

const SETTINGS_KEY = `${storageNamespace}:settings`;

export function clampCaptionMs(value: number): number {
  if (!Number.isFinite(value)) return CAPTION_DEFAULT_MS;
  return Math.min(CAPTION_MAX_MS, Math.max(CAPTION_MIN_MS, Math.round(value)));
}

export function defaultSettings(): Settings {
  return { captionMs: CAPTION_DEFAULT_MS, timeZone: DEFAULT_TIMEZONE };
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

// 每个计数器可覆盖全局字幕时长；未设置则回退到全局设置
const CAPTION_OVERRIDES_KEY = `${storageNamespace}:caption-overrides`;

export function loadCaptionOverrides(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CAPTION_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) result[key] = clampCaptionMs(Number(value));
    return result;
  } catch {
    return {};
  }
}

export function saveCaptionOverride(counterId: string, ms: number | null): void {
  if (typeof window === 'undefined') return;
  try {
    const overrides = loadCaptionOverrides();
    if (ms === null) delete overrides[counterId];
    else overrides[counterId] = clampCaptionMs(ms);
    window.localStorage.setItem(CAPTION_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    /* 忽略存储错误 */
  }
}

export function effectiveCaptionMs(overrides: Record<string, number>, counterId: string, globalMs: number): number {
  return overrides[counterId] ?? clampCaptionMs(globalMs);
}
