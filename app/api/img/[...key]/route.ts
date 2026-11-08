import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/runtime';
import { jsonError } from '@/lib/http';
import { ownsImage, resolveImageDeviceId } from '@/lib/image-access';

export async function GET(req: NextRequest, { params }: { params: { key: string[] } }) {
  // <img> 用 ?device_id=；带头的请求用 X-Device-Id。二者取其一即可，缺失 / 非法 400。
  const query = new URL(req.url).searchParams.get('device_id');
  const deviceId = resolveImageDeviceId(query, req.headers.get('x-device-id'));
  if (!deviceId) return jsonError('device_id 缺失或非法', 400);
  try {
    const { DB, IMAGES } = getEnv();
    const key = params.key.join('/');
    // 先确认 key 存在于 images 表且归属该设备，再取 R2 对象；跨设备 / 裸 key 一律 404
    const row = await DB.prepare('SELECT r2_key, device_id FROM images WHERE r2_key = ?')
      .bind(key)
      .first<{ r2_key: string; device_id: string }>();
    if (!ownsImage(row, deviceId)) return new NextResponse('Not found', { status: 404 });
    const obj = await IMAGES.get(key);
    if (!obj) return new NextResponse('Not found', { status: 404 });
    const headers = new Headers();
    headers.set('content-type', obj.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    return new NextResponse(obj.body, { headers });
  } catch {
    return new NextResponse('读取失败', { status: 500 });
  }
}
