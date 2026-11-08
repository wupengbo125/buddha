import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/runtime';
import { requireSession, jsonError } from '@/lib/http';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireSession(req))) return jsonError('未登录', 401);
  try {
    const { DB, IMAGES } = getEnv();
    const row = await DB.prepare('SELECT r2_key FROM images WHERE id = ?')
      .bind(params.id)
      .first<{ r2_key: string }>();
    if (!row) return jsonError('图片不存在', 404);
    try {
      await IMAGES.delete(row.r2_key);
    } catch {
      /* 忽略 R2 对象已不存在 */
    }
    await DB.prepare('DELETE FROM images WHERE id = ?').bind(params.id).run();
    return NextResponse.json({ ok: true });
  } catch {
    return jsonError('删除失败', 500);
  }
}
