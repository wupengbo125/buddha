import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { D1Database } from '@/lib/db';
import { getEnv } from '@/lib/runtime';
import { getDeviceId, jsonError, readJson } from '@/lib/http';
import type { Counter } from '@/lib/types';

const SELECT_COUNTER =
  'SELECT id, device_id, name, caption, total, today, today_date, created_at, updated_at FROM counters';

type Ctx = { params: { id: string } };

async function ownedCounter(DB: D1Database, id: string, deviceId: string): Promise<Counter | null> {
  return DB.prepare(`${SELECT_COUNTER} WHERE id = ? AND device_id = ?`).bind(id, deviceId).first<Counter>();
}

const PatchBody = z
  .object({
    device_id: z.string().optional(),
    name: z.string().trim().min(1).max(60).optional(),
    caption: z.string().max(200).optional(),
  })
  .refine((d) => d.name !== undefined || d.caption !== undefined, { message: '无可更新字段' });

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const parsed = PatchBody.safeParse(await readJson(req));
  if (!parsed.success) return jsonError('输入无效', 400);
  const deviceId = getDeviceId(req, { device_id: parsed.data.device_id });
  if (!deviceId) return jsonError('device_id 缺失或非法', 400);
  try {
    const { DB } = getEnv();
    const existing = await ownedCounter(DB, params.id, deviceId);
    if (!existing) return jsonError('计数器不存在', 404);

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (parsed.data.name !== undefined) {
      sets.push('name = ?');
      vals.push(parsed.data.name);
    }
    if (parsed.data.caption !== undefined) {
      sets.push('caption = ?');
      vals.push(parsed.data.caption);
    }
    sets.push('updated_at = ?');
    vals.push(new Date().toISOString(), params.id, deviceId);
    await DB.prepare(`UPDATE counters SET ${sets.join(', ')} WHERE id = ? AND device_id = ?`).bind(...vals).run();

    const counter = await ownedCounter(DB, params.id, deviceId);
    return NextResponse.json({ counter });
  } catch {
    return jsonError('更新失败', 500);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const deviceId = getDeviceId(req);
  if (!deviceId) return jsonError('device_id 缺失或非法', 400);
  try {
    const { DB, IMAGES } = getEnv();
    const existing = await ownedCounter(DB, params.id, deviceId);
    if (!existing) return jsonError('计数器不存在', 404);

    const imgs = await DB.prepare('SELECT r2_key FROM images WHERE counter_id = ? AND device_id = ?')
      .bind(params.id, deviceId)
      .all<{ r2_key: string }>();
    for (const row of imgs.results ?? []) {
      try {
        await IMAGES.delete(row.r2_key);
      } catch {
        /* 忽略单个 R2 对象删除失败 */
      }
    }
    await DB.prepare('DELETE FROM images WHERE counter_id = ? AND device_id = ?').bind(params.id, deviceId).run();
    await DB.prepare('DELETE FROM tap_events WHERE counter_id = ? AND device_id = ?').bind(params.id, deviceId).run();
    await DB.prepare('DELETE FROM counters WHERE id = ? AND device_id = ?').bind(params.id, deviceId).run();
    return NextResponse.json({ ok: true });
  } catch {
    return jsonError('删除失败', 500);
  }
}
