import { deviceHeaders } from './device';
import type { Counter, ImageView, TapResult } from './types';

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...deviceHeaders(),
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };
  if (typeof init?.body === 'string' && !headers['content-type'] && !headers['Content-Type']) {
    headers['content-type'] = 'application/json';
  }
  const res = await fetch(path, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError((data.error as string) || `请求失败 (${res.status})`);
  return data as unknown as T;
}

export const api = {
  listCounters(deviceId: string): Promise<{ counters: Counter[] }> {
    return request(`/api/counters?device_id=${encodeURIComponent(deviceId)}`);
  },
  createCounter(deviceId: string, name: string, caption = ''): Promise<{ counter: Counter }> {
    return request('/api/counters', {
      method: 'POST',
      body: JSON.stringify({ device_id: deviceId, name, caption }),
    });
  },
  updateCounter(id: string, patch: { name?: string; caption?: string }): Promise<{ counter: Counter }> {
    return request(`/api/counters/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  deleteCounter(id: string): Promise<{ ok: boolean }> {
    return request(`/api/counters/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  reportTap(
    id: string,
    body: { device_id: string; event_id: string; delta: number; date: string },
  ): Promise<TapResult> {
    return request(`/api/counters/${encodeURIComponent(id)}/taps`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  listImages(counterId: string): Promise<{ images: ImageView[] }> {
    return request(`/api/images?counter_id=${encodeURIComponent(counterId)}`);
  },
  uploadImage(counterId: string, deviceId: string, file: File): Promise<{ id: string; url: string }> {
    const form = new FormData();
    form.append('counter_id', counterId);
    form.append('device_id', deviceId);
    form.append('file', file);
    return request('/api/images', { method: 'POST', body: form });
  },
  deleteImage(id: string): Promise<{ ok: boolean }> {
    return request(`/api/images/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
