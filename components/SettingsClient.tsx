'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
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

export function SettingsClient() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [theme, setTheme] = useState<Theme>('system');
  const [systemDark, setSystemDark] = useState(false);
  const [busy, setBusy] = useState(false);
  const [timeZoneInput, setTimeZoneInput] = useState('Asia/Shanghai');
  const [error, setError] = useState('');

  useEffect(() => {
    setSettings(loadSettings());
    setTimeZoneInput(loadSettings().timeZone);
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

  const saveTimeZone = () => {
    try {
      new Intl.DateTimeFormat('zh-CN', { timeZone: timeZoneInput.trim() });
      patch({ timeZone: timeZoneInput.trim() });
      setError('');
    } catch {
      setError('请输入有效时区，例如 Asia/Shanghai');
    }
  };

  return (
    <main className="page">
      <header className="page-header">
        <div><p className="eyebrow">偏好与账号</p><h1 className="page-title">设置</h1></div>
      </header>

      <section className="section">
        <h2 className="section-title">念诵</h2>
        <label className="block py-4">
          <span className="mb-4 flex justify-between text-sm"><span>字幕停留</span><span className="tabular-nums text-accent">{settings.captionMs / 1000} 秒</span></span>
          <input type="range" min={CAPTION_MIN_MS} max={CAPTION_MAX_MS} step={100} value={settings.captionMs}
            onChange={(event) => patch({ captionMs: Number(event.target.value) })} className="h-8 w-full accent-[rgb(var(--c-accent))]" />
        </label>
        <label className="mt-3 block">
          <span className="field-label">每日计数时区</span>
          <input type="text" value={timeZoneInput} onChange={(event) => setTimeZoneInput(event.target.value)} onBlur={saveTimeZone}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} list="timezone-list" className="field" />
          <datalist id="timezone-list"><option value="Asia/Shanghai" /><option value="Asia/Tokyo" /><option value="UTC" /><option value="America/Los_Angeles" /></datalist>
        </label>
        {error && <p className="error-message" role="alert">{error}</p>}
      </section>

      <section className="section">
        <h2 className="section-title">外观</h2>
          <div className="segmented" role="group" aria-label="外观模式">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => changeTheme(t)}
                aria-pressed={theme === t}
              >
                {t === 'system' ? '跟随系统' : t === 'light' ? '浅色' : '深色'}
              </button>
            ))}
          </div>
          {theme === 'system' && <p className="mt-3 text-xs text-muted">当前为{systemDark ? '深色' : '浅色'}</p>}
      </section>

      <section className="section">
      <h2 className="section-title">账号</h2>
      <button
        type="button"
        onClick={() => void logout()}
        disabled={busy}
        className="secondary-button w-full"
      >
        <LogOut size={18} /> 退出登录
      </button>
      </section>
    </main>
  );
}
