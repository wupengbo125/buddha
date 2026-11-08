import type { Counter, ImageView, TapResult } from './types';

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };
  if (typeof init?.body === 'string' && !headers['content-type'] && !headers['Content-Type']) {
    headers['content-type'] = 'application/json';
  }
  // session 走 cookie，同源请求自动携带；不再有 device_id 参数 / X-Device-Id 头。
  const res = await fetch(path, { ...init, credentials: 'same-origin', headers });
  if (res.status === 401) {
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new ApiError('未登录');
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError((data.error as string) || `请求失败 (${res.status})`);
  return data as unknown as T;
}

export const api = {
  me(): Promise<{ authenticated: boolean }> {
    return request('/api/auth/me');
  },
  logout(): Promise<{ ok: boolean }> {
    return request('/api/auth/logout', { method: 'POST' });
  },
  listCounters(): Promise<{ counters: Counter[] }> {
    return request('/api/counters');
  },
  createCounter(name: string, caption = ''): Promise<{ counter: Counter }> {
    return request('/api/counters', {
      method: 'POST',
      body: JSON.stringify({ name, caption }),
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
    body: { event_id: string; delta: number; date: string },
  ): Promise<TapResult> {
    return request(`/api/counters/${encodeURIComponent(id)}/taps`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  listImages(counterId: string): Promise<{ images: ImageView[] }> {
    return request(`/api/images?counter_id=${encodeURIComponent(counterId)}`);
  },
  uploadImage(counterId: string, file: File): Promise<{ id: string; url: string }> {
    const form = new FormData();
    form.append('counter_id', counterId);
    form.append('file', file);
    return request('/api/images', { method: 'POST', body: form });
  },
  deleteImage(id: string): Promise<{ ok: boolean }> {
    return request(`/api/images/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
