import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ulid } from 'ulid';
import { getEnv } from '@/lib/runtime';
import { getDeviceId, jsonError } from '@/lib/http';
import { imageKey, uploadImage } from '@/lib/r2';
import { imageUrl } from '@/lib/image-access';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const UploadMeta = z.object({
  counter_id: z.string().min(1),
  name: z.string().min(1).max(255),
  type: z.string().max(120),
  size: z.number().int().positive().max(MAX_IMAGE_BYTES),
});

// 列表回显：详情页据此展示该计数器的全部图片
export async function GET(req: NextRequest) {
  const deviceId = getDeviceId(req);
  if (!deviceId) return jsonError('device_id 缺失或非法', 400);
  const counterId = new URL(req.url).searchParams.get('counter_id');
  if (!counterId) return jsonError('counter_id 缺失', 400);
  try {
    const { DB } = getEnv();
    const owned = await DB.prepare('SELECT id FROM counters WHERE id = ? AND device_id = ?')
      .bind(counterId, deviceId)
      .first();
    if (!owned) return jsonError('计数器不存在', 404);
    const res = await DB.prepare(
      'SELECT id, r2_key, content_type, created_at FROM images WHERE counter_id = ? AND device_id = ? ORDER BY created_at ASC, id ASC',
    )
      .bind(counterId, deviceId)
      .all<{ id: string; r2_key: string; content_type: string | null; created_at: string }>();
    const images = (res.results ?? []).map((r) => ({
      id: r.id,
      url: imageUrl(r.r2_key, deviceId),
      content_type: r.content_type,
      created_at: r.created_at,
    }));
    return NextResponse.json({ images });
  } catch {
    return jsonError('获取图片失败', 500);
  }
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return jsonError('表单无效', 400);
  const counterIdRaw = form.get('counter_id');
  const file = form.get('file');
  const bodyDeviceId = form.get('device_id');

  const deviceId = getDeviceId(req, { device_id: typeof bodyDeviceId === 'string' ? bodyDeviceId : undefined });
  if (!deviceId) return jsonError('device_id 缺失或非法', 400);
  if (typeof counterIdRaw !== 'string' || !counterIdRaw) return jsonError('缺少 counter_id', 400);
  if (!file || typeof file === 'string') return jsonError('缺少 file', 400);

  const meta = UploadMeta.safeParse({
    counter_id: counterIdRaw,
    name: file.name || 'image',
    type: file.type || 'application/octet-stream',
    size: file.size,
  });
  if (!meta.success) return jsonError(meta.error.issues[0]?.message ?? '文件无效', 400);

  try {
    const { DB, IMAGES } = getEnv();
    const owned = await DB.prepare('SELECT id FROM counters WHERE id = ? AND device_id = ?')
      .bind(counterIdRaw, deviceId)
      .first();
    if (!owned) return jsonError('计数器不存在', 404);

    const key = imageKey(deviceId, counterIdRaw, file.name || 'image');
    const contentType = file.type || 'application/octet-stream';
    await uploadImage(IMAGES, key, await file.arrayBuffer(), contentType);
    const id = ulid();
    await DB.prepare(
      'INSERT INTO images (id, counter_id, device_id, r2_key, content_type, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(id, counterIdRaw, deviceId, key, contentType, new Date().toISOString())
      .run();
    return NextResponse.json({ id, url: imageUrl(key, deviceId) }, { status: 201 });
  } catch {
    return jsonError('上传失败', 500);
  }
}
