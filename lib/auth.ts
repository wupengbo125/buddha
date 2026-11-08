// 鉴权纯逻辑：不依赖浏览器 / Cloudflare 上下文，可被 middleware、API route、vitest 共用。
// 仅依赖 jose 与 Web Crypto（Edge 与 Node 22 均有 globalThis.crypto）。

import { SignJWT, jwtVerify } from 'jose';

/** 唯一账号（个人用，无注册 / 多用户）。非品牌词，不进 brand.ts。 */
export const OWNER_USERNAME = '18592012523';
/** 去 device_id 隔离后，所有数据写入统一归到此 id，手机 / 电脑登同一账号看到同一份。 */
export const OWNER_ID = 'owner';
export const SESSION_COOKIE = 'buddha_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 天

export interface SessionPayload {
  sub: string;
}

/** 常量时间字符串比较：不短路、长度不同也按最长长度比完，避免按字节早退泄露。 */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  let diff = aa.length ^ bb.length;
  const n = Math.max(aa.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/** 用户名错误与密码错误返回同一个结果，不区分；密码为空一律拒绝。 */
export function verifyCredentials(username: string, password: string, expectedPassword: string): boolean {
  if (!expectedPassword) return false;
  const userOk = timingSafeEqual(username, OWNER_USERNAME);
  const passOk = timingSafeEqual(password, expectedPassword);
  return userOk && passOk;
}

/** 签名密钥从密码派生：SHA-256 取十六进制，不引入第二个 secret。 */
export async function deriveSecret(password: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function signSession(secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(OWNER_USERNAME)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(new TextEncoder().encode(secret));
}

/** 校验签名 / 过期 / subject；任一不合法返回 null（一律视为未登录）。 */
export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.sub !== OWNER_USERNAME) return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}
