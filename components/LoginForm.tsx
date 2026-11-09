'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
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
    <main className="login-page">
      <form onSubmit={submit} className="w-full">
        <div className="mb-10 text-center">
          <img src="/wooden-fish.png" alt="" className="login-art" />
          <h1 className="page-title">{siteName}</h1>
          <p className="mt-3 text-sm text-muted">{siteSubtitle}</p>
        </div>

        <div className="space-y-5">
          <label className="block"><span className="field-label">账号</span>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="账号"
            required
            className="field"
          />
          </label>
          <label className="block"><span className="field-label">密码</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            required
            className="field"
          />
          </label>
        </div>

        {error && <p className="error-message" role="alert">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="primary-button mt-8 w-full"
        >
          {loading ? '正在登录...' : '登录'}<ArrowRight size={18} />
        </button>
      </form>
    </main>
  );
}
