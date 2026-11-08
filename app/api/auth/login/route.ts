import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyCredentials } from '@/lib/auth';
import { getPassword, createSession, setSessionCookie } from '@/lib/session';
import { jsonError } from '@/lib/http';

const Body = z.object({ username: z.string(), password: z.string() });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError('输入无效', 400);

  let password: string;
  try {
    password = getPassword();
  } catch {
    // 密码未配置：fail-closed，明确报错，绝不生成 session、绝不静默降级。
    return jsonError('服务端未配置登录密码，请联系管理员', 500);
  }

  if (!verifyCredentials(parsed.data.username, parsed.data.password, password)) {
    // 用户名错 / 密码错：同一个通用错误，不区分。
    return jsonError('账号或密码错误', 401);
  }

  const token = await createSession(password);
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, token, req.nextUrl.protocol === 'https:');
  return res;
}
