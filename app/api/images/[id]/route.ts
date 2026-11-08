import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/runtime';
import { getDeviceId, jsonError } from '@/lib/http';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const deviceId = getDeviceId(req);
  if (!deviceId) return jsonError('device_id 缺失或非法', 400);
  try {
    const { DB, IMAGES } = getEnv();
    const row = await DB.prepare('SELECT r2_key FROM images WHERE id = ? AND device_id = ?')
      .bind(params.id, deviceId)
      .first<{ r2_key: string }>();
    if (!row) return jsonError('图片不存在', 404);
    try {
      await IMAGES.delete(row.r2_key);
    } catch {
      /* 忽略 R2 对象已不存在 */
    }
    await DB.prepare('DELETE FROM images WHERE id = ? AND device_id = ?').bind(params.id, deviceId).run();
    return NextResponse.json({ ok: true });
  } catch {
    return jsonError('删除失败', 500);
  }
}
