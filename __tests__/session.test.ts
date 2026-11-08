// R1 fail-closed：密码缺失时任何路径都不能登录 / 不能伪造 session 放行；有密码时全流程正常。
// 测试显式注入 throwaway 密码，不依赖 Cloudflare 上下文。
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import { getPassword, readSession, verifyToken, createSession } from '@/lib/session';
import { OWNER_USERNAME, deriveSecret, signSession } from '@/lib/auth';
import { POST as login } from '@/app/api/auth/login/route';

const PW = 'test-only-pw-2026';
const COOKIE = 'buddha_session';
const ORIGINAL = process.env.common_password;

function setPassword(v: string | undefined): void {
  if (v === undefined) delete process.env.common_password;
  else process.env.common_password = v;
}

afterEach(() => setPassword(ORIGINAL));

function loginRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function authedRequest(token: string): NextRequest {
  return new NextRequest('http://localhost/', { headers: { cookie: `${COOKIE}=${token}` } });
}

describe('R1 · getPassword fail-closed', () => {
  it('密码缺失 / 空串 → 抛错，绝不返回空串', () => {
    setPassword(undefined);
    expect(() => getPassword()).toThrow(/common_password/);
    setPassword('');
    expect(() => getPassword()).toThrow(/common_password/);
  });

  it('显式配置了密码 → 返回该值', () => {
    setPassword(PW);
    expect(getPassword()).toBe(PW);
  });
});

describe('R1 · 登录 API 密码缺失 → 500，不生成 session', () => {
  it('未配置密码，即使用正确账号密码也不能登录', async () => {
    setPassword(undefined);
    const res = await login(loginRequest({ username: OWNER_USERNAME, password: PW }));
    expect(res.status).toBe(500);
    expect(res.cookies.get(COOKIE)).toBeUndefined();
  });

  it('错误密码 → 401（有密码配置时）', async () => {
    setPassword(PW);
    const res = await login(loginRequest({ username: OWNER_USERNAME, password: 'wrong' }));
    expect(res.status).toBe(401);
    expect(res.cookies.get(COOKIE)).toBeUndefined();
  });

  it('正确账号 + 正确密码 → 200 且设置 session cookie', async () => {
    setPassword(PW);
    const res = await login(loginRequest({ username: OWNER_USERNAME, password: PW }));
    expect(res.status).toBe(200);
    expect(res.cookies.get(COOKIE)?.value).toBeTruthy();
  });
});

describe('R1 · session 校验密码缺失 → 一律视为未登录', () => {
  it('合法 token 在密码缺失时不放行（不用空密钥验证）', async () => {
    setPassword(PW);
    const token = await createSession(PW);
    expect(await verifyToken(token)).toBe(true);
    setPassword(undefined);
    expect(await verifyToken(token)).toBe(false);
    setPassword(PW);
    expect(await verifyToken(token)).toBe(true);
  });

  it('无密码时 readSession 一律 false', async () => {
    setPassword(PW);
    const token = await createSession(PW);
    const req = authedRequest(token);
    setPassword(undefined);
    expect(await readSession(req)).toBe(false);
    setPassword(PW);
    expect(await readSession(req)).toBe(true);
  });

  it('攻击者用空密码派生密钥伪造 token：无论有无密码都不放行', async () => {
    const forged = await signSession(await deriveSecret(''));
    setPassword(PW);
    expect(await verifyToken(forged)).toBe(false);
    setPassword(undefined);
    expect(await verifyToken(forged)).toBe(false);
  });

  it('无 token / 乱码 token 一律 false', async () => {
    setPassword(PW);
    expect(await verifyToken(undefined)).toBe(false);
    expect(await verifyToken('')).toBe(false);
    expect(await verifyToken('not-a-jwt')).toBe(false);
  });
});
