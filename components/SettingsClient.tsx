'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { domainNote, siteUrl } from '@/lib/brand';
import { api } from '@/lib/api';
import { applyTheme, readTheme, resolveTheme, saveTheme, type Theme } from '@/lib/theme';
import {
  CAPTION_MIN_MS,
  CAPTION_MAX_MS,
  clampCaptionMs,
  defaultSettings,
  loadSettings,
  saveSettings,
  type Settings,
} from '@/lib/settings';

/** 设置页：点击音效全局总开关、字幕淡出时长、时区、外观、域名说明、退出登录。 */
export function SettingsClient() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [theme, setTheme] = useState<Theme>('system');
  const [systemDark, setSystemDark] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    const t = readTheme();
    applyTheme(t);
    setTheme(t);
    setSystemDark(resolveTheme('system') === 'dark');

    // 系统主题切换 / standalone 回到前台时重新应用：显式值不依赖 prefers-color-scheme，
    // system 模式下强制一次 reflow，补正 iOS PWA 里冻结的媒体查询。
    const sync = () => {
      const cur = readTheme();
      applyTheme(cur);
      void document.documentElement.offsetHeight;
      setTheme(cur);
      setSystemDark(resolveTheme('system') === 'dark');
    };
    const mq =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    if (mq) {
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', sync);
      else mq.addListener(sync); // 旧 Safari
    }
    document.addEventListener('visibilitychange', sync);
    return () => {
      if (mq) {
        if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', sync);
        else mq.removeListener(sync);
      }
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  const patch = (p: Partial<Settings>) => {
    const next: Settings = {
      captionMs: p.captionMs !== undefined ? clampCaptionMs(p.captionMs) : clampCaptionMs(settings.captionMs),
      timeZone: p.timeZone !== undefined ? p.timeZone : settings.timeZone,
      soundEnabled: p.soundEnabled !== undefined ? p.soundEnabled : settings.soundEnabled,
    };
    setSettings(next);
    saveSettings(next);
  };

  const changeTheme = (t: Theme) => {
    saveTheme(t);
    applyTheme(t);
    setTheme(t);
    setSystemDark(resolveTheme('system') === 'dark');
  };

  const logout = async () => {
    setBusy(true);
    try {
      await api.logout();
    } catch {
      /* 忽略，仍跳登录 */
    }
    router.push('/login');
    router.refresh();
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6 md:pb-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-wide text-ink">设置</h1>
      </header>

      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center justify-between gap-3 px-4 py-4 text-sm">
          <div className="flex flex-col gap-0.5">
            <span className="text-ink-soft">点击音效</span>
            <span className="text-xs text-muted">一键全关；开启后每个佛号可单独设置</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.soundEnabled}
            aria-label="点击音效全局总开关"
            onClick={() => patch({ soundEnabled: !settings.soundEnabled })}
            className={`tap-press relative h-7 w-12 shrink-0 rounded-full border border-line transition-colors ${
              settings.soundEnabled ? 'bg-accent' : 'bg-line'
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
                settings.soundEnabled ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
        <div className="flex flex-col gap-2 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-ink-soft">外观</span>
            {theme === 'system' && (
              <span className="text-xs text-muted">跟随系统 · 当前{systemDark ? '深色' : '浅色'}</span>
            )}
          </div>
          <div className="inline-flex rounded-full border border-line bg-bg p-1" role="group" aria-label="外观模式">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => changeTheme(t)}
                aria-pressed={theme === t}
                className={[
                  'tap-press rounded-full px-4 py-1.5 text-sm transition-colors',
                  theme === t ? 'bg-accent-soft font-semibold text-accent-deep' : 'text-muted hover:text-ink-soft',
                ].join(' ')}
              >
                {t === 'system' ? '跟随系统' : t === 'light' ? '浅色' : '深色'}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-2 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-ink-soft">字幕淡出时长（毫秒，{CAPTION_MIN_MS}–{CAPTION_MAX_MS}）</span>
          <input
            type="number"
            min={CAPTION_MIN_MS}
            max={CAPTION_MAX_MS}
            step={100}
            value={settings.captionMs}
            onChange={(e) => patch({ captionMs: Number(e.target.value) })}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-accent sm:w-40"
          />
        </label>
        <label className="flex flex-col gap-2 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-ink-soft">时区（每日零点归零用）</span>
          <input
            type="text"
            value={settings.timeZone}
            onChange={(e) => patch({ timeZone: e.target.value })}
            list="timezone-list"
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-accent sm:w-56"
          />
          <datalist id="timezone-list">
            <option value="Asia/Shanghai" />
            <option value="Asia/Tokyo" />
            <option value="UTC" />
            <option value="America/Los_Angeles" />
          </datalist>
        </label>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted">{domainNote}</p>
      <p className="mt-1 text-xs text-muted">访问地址：{siteUrl}</p>

      <button
        type="button"
        onClick={() => void logout()}
        disabled={busy}
        className="tap-press mt-8 flex w-full items-center justify-center gap-2 rounded-full border border-line bg-surface py-3 text-base font-semibold text-ink disabled:opacity-50"
      >
        <LogOut size={18} /> 退出登录
      </button>
    </main>
  );
}
