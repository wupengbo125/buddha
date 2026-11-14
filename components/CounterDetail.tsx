'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, ImagePlus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { practiceRequest } from './PracticeLibrary';
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
  const router = useRouter();
  const [counter, setCounter] = useState<Counter | null>(null);
  const [name, setName] = useState('');
  const [captionText, setCaptionText] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
        const found = counters.find((c) => c.id === id) ?? null;
        setCounter(found);
        setName(found?.name ?? '');
        setCaptionText(found?.caption ?? '');
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

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const { counter: updated } = await api.updateCounter(id, { name: name.trim(), caption: captionText.trim() });
      setCounter(updated);
      saveCaptionDuration();
      setSaved(true);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await api.deleteCounter(id);
      saveCaptionOverride(id, null);
      router.push('/practices');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      await practiceRequest('/api/practice-session', 'POST', { action: 'pause' });
      router.push(`/?counter=${encodeURIComponent(id)}`);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
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
    <main className="page">
      <header className="page-header">
        <Link href="/practices" aria-label="返回发愿列表" title="返回发愿列表" className="icon-button -ml-3">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="flex-1 text-xl font-semibold">编辑发愿</h1>
        {counter && <button type="button" onClick={start} disabled={busy} className="icon-button" title="开始念诵" aria-label="开始念诵"><ArrowUpRight size={22} /></button>}
      </header>

      {error && <p className="error-message" role="alert">{error}</p>}

      {loading ? (
        <p className="empty-state" role="status">正在载入...</p>
      ) : !counter ? (
        <p className="empty-state">发愿不存在</p>
      ) : (
        <>
          <div className="count-row" aria-label={`今日 ${counter.today} 声，累计 ${counter.total} 声`}>
            <span className="count-row-label">今日</span>
            <span className="count-row-num count-row-today">{counter.today.toLocaleString()}</span>
            <span className="count-row-sep">/</span>
            <span className="count-row-label">累计</span>
            <span className="count-row-num count-row-total">{counter.total.toLocaleString()}</span>
            <span className="count-row-label">声</span>
          </div>
          <form onSubmit={save} onChange={() => setSaved(false)}>
            <label className="field-label" htmlFor="counter-name">念诵内容</label>
            <input id="counter-name" className="field mb-6" value={name} onChange={(event) => setName(event.target.value)} required maxLength={60} />
            <label className="field-label" htmlFor="counter-caption">发愿提示</label>
            <input id="counter-caption" className="field mb-6" value={captionText} onChange={(event) => setCaptionText(event.target.value)} placeholder={counter.name} maxLength={200} />
            <div className="section">
              <label className="field-label" htmlFor="caption-mode">字幕时长</label>
              <select id="caption-mode" className="field" value={captionMsInput === '' ? 'global' : 'custom'} onChange={(event) => setCaptionMsInput(event.target.value === 'global' ? '' : String(globalMs))}>
                <option value="global">跟随全局 · {globalMs / 1000} 秒</option>
                <option value="custom">自定义</option>
              </select>
              {captionMsInput !== '' && <label className="mt-4 flex items-center gap-3 text-sm text-muted">
                <input aria-label="字幕时长（毫秒）" className="field" type="number" min={CAPTION_MIN_MS} max={CAPTION_MAX_MS} step={100} value={captionMsInput} onChange={(event) => setCaptionMsInput(event.target.value)} required />毫秒
              </label>}
            </div>
            <button className="primary-button w-full" type="submit" disabled={busy || !name.trim()}><Check size={18} />{busy ? '正在处理...' : '保存修改'}</button>
            {saved && <p className="mt-3 text-center text-sm text-accent" role="status">已保存</p>}
          </form>

          <section className="section">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm">发愿图片 <span className="ml-1 text-muted">{images.length}</span></h2>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="icon-button text-accent" aria-label="上传图片" title="上传图片"
              >
                <ImagePlus size={22} />
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
              <p className="py-8 text-center text-sm text-muted">暂无图片</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {images.map((img) => (
                  <div key={img.id} className="group relative overflow-hidden rounded-lg border border-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="发愿图片" className="aspect-square w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => void removeImage(img.id)}
                      className="icon-button absolute right-1 top-1 bg-bg/95" aria-label="删除图片" title="删除图片"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="section">
            {confirmDelete ? <div className="space-y-4">
              <p className="text-sm text-danger">删除“{counter.name}”及全部计数和图片？此操作无法撤销。</p>
              <div className="grid grid-cols-2 gap-3">
                <button className="secondary-button" disabled={busy} onClick={() => setConfirmDelete(false)}>取消</button>
                <button className="primary-button bg-danger" disabled={busy} onClick={() => void remove()}>确认删除</button>
              </div>
            </div> : <button className="secondary-button w-full text-danger" onClick={() => setConfirmDelete(true)}><Trash2 size={17} />删除发愿</button>}
          </section>
        </>
      )}
    </main>
  );
}
