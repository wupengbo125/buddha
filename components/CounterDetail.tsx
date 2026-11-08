'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ImagePlus } from 'lucide-react';
import { siteName } from '@/lib/brand';
import { api } from '@/lib/api';
import { getDeviceId } from '@/lib/device';
import {
  CAPTION_DEFAULT_MS,
  CAPTION_MIN_MS,
  CAPTION_MAX_MS,
  clampCaptionMs,
  loadCaptionOverrides,
  loadSettings,
  saveCaptionOverride,
} from '@/lib/settings';
import type { Counter, ImageView } from '@/lib/types';

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : '操作失败';
}

export function CounterDetail({ id }: { id: string }) {
  const [counter, setCounter] = useState<Counter | null>(null);
  const [images, setImages] = useState<ImageView[]>([]);
  const [nameDraft, setNameDraft] = useState('');
  const [captionDraft, setCaptionDraft] = useState('');
  const [captionMsInput, setCaptionMsInput] = useState('');
  const [globalMs, setGlobalMs] = useState(CAPTION_DEFAULT_MS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const deviceIdRef = useRef('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const deviceId = getDeviceId();
        deviceIdRef.current = deviceId;
        const [{ counters }, { images: imgs }] = await Promise.all([
          api.listCounters(deviceId),
          api.listImages(id),
        ]);
        const found = counters.find((c) => c.id === id) ?? null;
        setCounter(found);
        setImages(imgs);
        if (found) {
          setNameDraft(found.name);
          setCaptionDraft(found.caption);
        }
        setGlobalMs(loadSettings().captionMs);
        const override = loadCaptionOverrides()[id];
        setCaptionMsInput(override !== undefined ? String(override) : '');
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const saveName = async () => {
    const name = nameDraft.trim();
    if (!name) return;
    setBusy(true);
    setError('');
    try {
      const { counter: updated } = await api.updateCounter(id, { name });
      setCounter(updated);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const saveCaptionText = async () => {
    setBusy(true);
    setError('');
    try {
      const { counter: updated } = await api.updateCounter(id, { caption: captionDraft });
      setCounter(updated);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const saveCaptionDuration = () => {
    if (captionMsInput.trim() === '') {
      saveCaptionOverride(id, null);
      setCaptionMsInput('');
      return;
    }
    const clamped = clampCaptionMs(Number(captionMsInput));
    saveCaptionOverride(id, clamped);
    setCaptionMsInput(String(clamped));
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError('');
    try {
      for (const file of Array.from(files)) {
        const res = await api.uploadImage(id, deviceIdRef.current, file);
        setImages((prev) => [
          ...prev,
          { id: res.id, url: res.url, content_type: file.type || null, created_at: '' },
        ]);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeImage = async (imageId: string) => {
    try {
      await api.deleteImage(imageId);
      setImages((prev) => prev.filter((img) => img.id !== imageId));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
      <header className="mb-5 flex items-center gap-3">
        <Link href="/" aria-label="返回首页" className="tap-press rounded-lg p-1 text-muted">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="flex-1 truncate text-2xl font-bold text-ink">{counter?.name ?? siteName}</h1>
      </header>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="mt-10 text-center text-muted">加载中…</p>
      ) : !counter ? (
        <p className="mt-10 text-center text-muted">计数器不存在或不属于本设备</p>
      ) : (
        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <h2 className="mb-3 font-semibold text-ink">基本设置</h2>
            <label className="mb-3 flex flex-col gap-1 text-sm">
              <span className="text-muted">佛号名称</span>
              <div className="flex gap-2">
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-accent"
                />
                <button onClick={() => void saveName()} disabled={busy} className="tap-press rounded-lg bg-accent px-4 font-semibold text-white disabled:opacity-50">
                  保存
                </button>
              </div>
            </label>
            <label className="mb-3 flex flex-col gap-1 text-sm">
              <span className="text-muted">字幕文案（点按弹出，留空则取佛号名）</span>
              <div className="flex gap-2">
                <input
                  value={captionDraft}
                  onChange={(e) => setCaptionDraft(e.target.value)}
                  placeholder={counter.name}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-accent"
                />
                <button onClick={() => void saveCaptionText()} disabled={busy} className="tap-press rounded-lg bg-accent px-4 font-semibold text-white disabled:opacity-50">
                  保存
                </button>
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">
                字幕时长覆盖（毫秒，{CAPTION_MIN_MS}–{CAPTION_MAX_MS}；留空跟随全局 {globalMs}ms）
              </span>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={CAPTION_MIN_MS}
                  max={CAPTION_MAX_MS}
                  step={100}
                  value={captionMsInput}
                  onChange={(e) => setCaptionMsInput(e.target.value)}
                  placeholder={`跟随全局 ${globalMs}`}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-accent"
                />
                <button onClick={saveCaptionDuration} className="tap-press rounded-lg border border-accent px-4 font-semibold text-accent">
                  保存
                </button>
              </div>
            </label>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-ink">图片墙</h2>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="tap-press flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <ImagePlus size={16} /> 上传图片
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => void uploadFiles(e.target.files)}
              />
            </div>

            {images.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">还没有图片，点上方按钮添加</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {images.map((img) => (
                  <div key={img.id} className="group relative overflow-hidden rounded-xl border border-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="佛号图片" className="aspect-square w-full object-cover" />
                    <button
                      onClick={() => void removeImage(img.id)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-1 text-xs text-white"
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
