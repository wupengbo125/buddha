import { NextRequest, NextResponse } from 'next/server';

// 所有数据 API 统一从这里取 session 校验（实现见 lib/session.ts）。
export { requireSession } from './session';

export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
