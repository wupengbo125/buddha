'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ImagePlus } from 'lucide-react';
import { siteName } from '@/lib/brand';
import { api } from '@/lib/api';
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

/** 详情页：只管该佛号的图片（上传/删除/回显）与单计数器字幕时长。不管全局设置 / 其它佛号。 */
export function CounterDetail({ id }: { id: string }) {
  const [counter, setCounter] = useState<Counter | null>(null);
  const [images, setImages] = useState<ImageView[]>([]);
  const [captionMsInput, setCaptionMsInput] = useState('');
  const [globalMs, setGlobalMs] = useState(CAPTION_DEFAULT_MS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const [{ counters }, { images: imgs }] = await Promise.all([
          api.listCounters(),
          api.listImages(id),
        ]);
        setCounter(counters.find((c) => c.id === id) ?? null);
        setImages(imgs);
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
        const res = await api.uploadImage(id, file);
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
    <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6 md:pb-12">
      <header className="mb-5 flex items-center gap-3">
        <Link href="/counters" aria-label="返回添加页" className="tap-press rounded-lg p-1 text-muted">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="flex-1 truncate text-2xl font-semibold tracking-wide text-ink">{counter?.name ?? siteName}</h1>
      </header>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="mt-12 text-center text-muted">加载中…</p>
      ) : !counter ? (
        <p className="mt-12 text-center text-muted">计数器不存在</p>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-line bg-surface px-4 py-4">
            <h2 className="mb-1 text-base font-semibold text-ink">字幕时长覆盖</h2>
            <p className="mb-3 text-xs text-muted">
              留空跟随全局 {globalMs}ms；范围 {CAPTION_MIN_MS}–{CAPTION_MAX_MS} 毫秒
            </p>
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
              <button
                type="button"
                onClick={saveCaptionDuration}
                className="tap-press rounded-full border border-accent px-5 font-semibold text-accent"
              >
                保存
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface px-4 py-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">图片</h2>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="tap-press flex items-center gap-1 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
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
              <p className="py-10 text-center text-sm text-muted">还没有图片，点上方按钮添加</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {images.map((img) => (
                  <div key={img.id} className="group relative overflow-hidden rounded-xl border border-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="佛号图片" className="aspect-square w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => void removeImage(img.id)}
                      className="absolute right-1 top-1 rounded-full bg-ink/75 px-2 py-1 text-xs text-bg"
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
