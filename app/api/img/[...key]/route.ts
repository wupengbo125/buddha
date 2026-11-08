import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/runtime';
import { requireSession, jsonError } from '@/lib/http';

export async function GET(req: NextRequest, { params }: { params: { key: string[] } }) {
  // v3：<img src> 自动携带 session cookie，验 session 即可；URL 不再带 device_id。
  if (!(await requireSession(req))) return jsonError('未登录', 401);
  try {
    const { DB, IMAGES } = getEnv();
    const key = params.key.join('/');
    // 校验 key 存在于 images 表（单账号一份数据，不再按 device_id 过滤），否则 404。
    const row = await DB.prepare('SELECT r2_key FROM images WHERE r2_key = ?').bind(key).first();
    if (!row) return new NextResponse('Not found', { status: 404 });
    const obj = await IMAGES.get(key);
    if (!obj) return new NextResponse('Not found', { status: 404 });
    const headers = new Headers();
    headers.set('content-type', obj.httpMetadata?.contentType || 'application/octet-stream');
    // 图片靠 session cookie 鉴权且全员同一 URL，属私有数据：禁止 public 共享缓存，避免把登录者响应回给未登录者。
    headers.set('cache-control', 'private, no-store');
    return new NextResponse(obj.body, { headers });
  } catch {
    return new NextResponse('读取失败', { status: 500 });
  }
}
