'use client';

import { domainNote } from '@/lib/brand';
import { CAPTION_MIN_MS, CAPTION_MAX_MS, type Settings } from '@/lib/settings';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

export function SettingsPanel({ settings, onChange }: Props) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 text-sm shadow-sm">
      <h3 className="mb-3 font-semibold text-ink">设置</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-muted">字幕淡出时长（毫秒，{CAPTION_MIN_MS}–{CAPTION_MAX_MS}）</span>
          <input
            type="number"
            min={CAPTION_MIN_MS}
            max={CAPTION_MAX_MS}
            step={100}
            value={settings.captionMs}
            onChange={(e) => onChange({ captionMs: Number(e.target.value) })}
            className="rounded-lg border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">时区（每日零点归零用）</span>
          <input
            type="text"
            value={settings.timeZone}
            onChange={(e) => onChange({ timeZone: e.target.value })}
            list="timezone-list"
            className="rounded-lg border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-accent"
          />
          <datalist id="timezone-list">
            <option value="Asia/Shanghai" />
            <option value="Asia/Tokyo" />
            <option value="UTC" />
            <option value="America/Los_Angeles" />
          </datalist>
        </label>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">{domainNote}</p>
    </section>
  );
}
