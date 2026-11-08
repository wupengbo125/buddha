'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { siteName, siteSubtitle } from '@/lib/brand';

/** 登录页：只有账号 / 密码表单与错误提示，无导航、无计数数据。 */
export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('18592012523');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? '登录失败');
        setLoading(false);
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('网络错误，请重试');
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-surface px-7 py-9">
        <div className="mb-8 text-center">
          <h1 className="text-[28px] font-semibold tracking-[0.12em] text-ink">{siteName}</h1>
          <p className="mt-1 text-sm text-muted">{siteSubtitle} · 登录</p>
        </div>

        <div className="space-y-4">
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="账号"
            required
            className="h-12 w-full rounded-xl border border-line bg-bg px-4 text-base text-ink outline-none focus:border-accent"
          />
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            required
            className="h-12 w-full rounded-xl border border-line bg-bg px-4 text-base text-ink outline-none focus:border-accent"
          />
        </div>

        {error && <p className="mt-4 text-center text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="tap-press mt-7 h-12 w-full rounded-full bg-accent text-[17px] font-semibold text-white disabled:opacity-50"
        >
          {loading ? '正在登录…' : '登 录'}
        </button>
      </form>
    </main>
  );
}
