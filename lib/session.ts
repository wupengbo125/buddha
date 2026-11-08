// 服务端 session 环境绑定：读密码、读 / 写 cookie、校验 session。
// 只依赖 @opennextjs/cloudflare、next/server 与纯逻辑 auth.ts；不触碰 runtime.ts / local.ts，
// 保证 middleware（Edge）打包干净。

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  deriveSecret,
  signSession,
  verifySession,
} from './auth';

/**
 * 读取密码：生产从 Cloudflare secret（env binding）读，本地 next dev / next start / 测试回退 process.env。
 * 两处都缺失则抛错 —— fail-closed，绝不返回空串派生出确定弱密钥（否则可伪造 session 绕过登录）。
 * middleware 跑在 Edge，getCloudflareContext() 可能抛异常，异常同样走本地回退，仍缺失则抛错。
 */
export function getPassword(): string {
  let cfPassword: string | undefined;
  try {
    const env = getCloudflareContext().env as unknown as { common_password?: string } | undefined;
    cfPassword = env?.common_password;
  } catch {
    // 不在 Cloudflare 运行时 / Edge 上下文异常：回退本地环境变量
  }
  const password = cfPassword || process.env.common_password;
  if (!password) {
    throw new Error('common_password 未配置：请在 Cloudflare Worker secret 或本地环境变量中设置');
  }
  return password;
}

/**
 * 校验 token 是否有效。密码缺失 / CF 上下文异常 / 任一错误一律返回 false（视为未登录），
 * 绝不放行，也绝不用空密钥去验证。供 middleware、页面守卫、所有数据 API 共用。
 */
export async function verifyToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    return (await verifySession(token, await deriveSecret(getPassword()))) !== null;
  } catch {
    return false;
  }
}

/** 请求是否携带有效 session。 */
export async function readSession(req: NextRequest): Promise<boolean> {
  return verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
}

/** 供所有数据 API 调用：未登录返回 false（调用方回 401）。 */
export async function requireSession(req: NextRequest): Promise<boolean> {
  return readSession(req);
}

/** 登录成功后签发 session；password 由调用方（登录 API）读取并显式传入。 */
export async function createSession(password: string): Promise<string> {
  return signSession(await deriveSecret(password));
}

export function setSessionCookie(res: NextResponse, token: string, secure: boolean): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
}
