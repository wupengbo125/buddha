'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { domainNote, siteUrl } from '@/lib/brand';
import { api } from '@/lib/api';
import {
  CAPTION_MIN_MS,
  CAPTION_MAX_MS,
  clampCaptionMs,
  defaultSettings,
  loadSettings,
  saveSettings,
  type Settings,
} from '@/lib/settings';

/** 设置页：字幕淡出时长、时区、域名说明、退出登录。不添加佛号、不计数。 */
export function SettingsClient() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const patch = (p: Partial<Settings>) => {
    const next: Settings = {
      captionMs: p.captionMs !== undefined ? clampCaptionMs(p.captionMs) : clampCaptionMs(settings.captionMs),
      timeZone: p.timeZone !== undefined ? p.timeZone : settings.timeZone,
    };
    setSettings(next);
    saveSettings(next);
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
