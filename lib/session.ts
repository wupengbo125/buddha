// 服务端 session 环境绑定：读密码、读 / 写 cookie、校验 session。
// 只依赖 @opennextjs/cloudflare、next/server 与纯逻辑 auth.ts；不触碰 runtime.ts / local.ts，
// 保证 middleware（Edge）打包干净。

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  OWNER_ID,
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

/** 读取账号名：同样只从 Cloudflare secret / 本地环境变量来，代码里不写死。 */
export function getUsername(): string {
  let cfUsername: string | undefined;
  try {
    const env = getCloudflareContext().env as unknown as { common_username?: string } | undefined;
    cfUsername = env?.common_username;
  } catch {
    // 不在 Cloudflare 运行时：回退本地环境变量
  }
  const username = cfUsername || process.env.common_username;
  if (!username) {
    throw new Error('common_username 未配置：请在 Cloudflare Worker secret 或本地环境变量中设置');
  }
  return username;
}

/** 请求是否携带有效 session。 */
export async function readSession(req: NextRequest): Promise<boolean> {
  return verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
}

/** 供所有数据 API 调用：未登录返回 false（调用方回 401）。 */
export async function requireSession(req: NextRequest): Promise<boolean> {
  return readSession(req);
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


export interface LoginAccount {
  username: string;
  password: string;
  owner: string;
}

/** 账号归属 id：主账号沿用 'owner'（历史数据都在它名下），其他人用用户名哈希，互不干扰。 */
async function ownerFor(username: string): Promise<string> {
  if (username === getUsername()) return OWNER_ID;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`buddha-account:${username}`));
  return `guest-${Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)}`;
}

function readEnvSecret(name: string): string | undefined {
  try {
    const env = getCloudflareContext().env as Record<string, string | undefined>;
    if (env?.[name]) return env[name];
  } catch {}
  return process.env[name];
}

/** 全部可登录账号：主账号 + Cloudflare secret 里的第二账号（本地走同名环境变量）。 */
export async function getAccounts(): Promise<LoginAccount[]> {
  const accounts: LoginAccount[] = [{ username: getUsername(), password: getPassword(), owner: OWNER_ID }];
  const secondUser = readEnvSecret('account2_username');
  const secondPassword = readEnvSecret('account2_password');
  if (secondUser && secondPassword) {
    accounts.push({ username: secondUser, password: secondPassword, owner: await ownerFor(secondUser) });
  }
  return accounts;
}

/** session 的签名密钥固定用主账号密码派生：主密码不变，所有账号的登录态都有效。 */
export async function sessionSecret(): Promise<string> {
  return deriveSecret(getPassword());
}

/** 登录成功后签发 session。 */
export async function createSession(owner: string): Promise<string> {
  return signSession(await sessionSecret(), owner);
}

/** 从 token 取数据归属 id；无效 token 返回 null。 */
export async function sessionOwner(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const payload = await verifySession(token, await sessionSecret());
    return payload?.sub ?? null;
  } catch {
    return null;
  }
}

/** 请求对应的数据归属 id；未登录返回 null。 */
export async function currentOwner(req: NextRequest): Promise<string | null> {
  return sessionOwner(req.cookies.get(SESSION_COOKIE)?.value);
}
