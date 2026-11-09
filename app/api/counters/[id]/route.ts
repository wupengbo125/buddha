import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { D1Database } from '@/lib/db';
import { getEnv } from '@/lib/runtime';
import { requireSession, jsonError, readJson } from '@/lib/http';
import type { Counter } from '@/lib/types';

const SELECT_COUNTER =
  'SELECT id, device_id, name, caption, total, today, today_date, sound_enabled, created_at, updated_at FROM counters';

type Ctx = { params: { id: string } };

async function ownedCounter(DB: D1Database, id: string): Promise<Counter | null> {
  // 去 device_id 隔离：只按 id 定位。
  return DB.prepare(`${SELECT_COUNTER} WHERE id = ?`).bind(id).first<Counter>();
}

const PatchBody = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    caption: z.string().max(200).optional(),
    sound_enabled: z.union([z.literal(0), z.literal(1)]).optional(),
  })
  .refine((d) => d.name !== undefined || d.caption !== undefined || d.sound_enabled !== undefined, {
    message: '无可更新字段',
  });

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!(await requireSession(req))) return jsonError('未登录', 401);
  const parsed = PatchBody.safeParse(await readJson(req));
  if (!parsed.success) return jsonError('输入无效', 400);
  try {
    const { DB } = getEnv();
    const existing = await ownedCounter(DB, params.id);
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
    if (parsed.data.sound_enabled !== undefined) {
      sets.push('sound_enabled = ?');
      vals.push(parsed.data.sound_enabled);
    }
    sets.push('updated_at = ?');
    vals.push(new Date().toISOString(), params.id);
    await DB.prepare(`UPDATE counters SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

    const counter = await ownedCounter(DB, params.id);
    return NextResponse.json({ counter });
  } catch {
    return jsonError('更新失败', 500);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!(await requireSession(req))) return jsonError('未登录', 401);
  try {
    const { DB, IMAGES } = getEnv();
    const existing = await ownedCounter(DB, params.id);
    if (!existing) return jsonError('计数器不存在', 404);

    const imgs = await DB.prepare('SELECT r2_key FROM images WHERE counter_id = ?')
      .bind(params.id)
      .all<{ r2_key: string }>();
    for (const row of imgs.results ?? []) {
      try {
        await IMAGES.delete(row.r2_key);
      } catch {
        /* 忽略单个 R2 对象删除失败 */
      }
    }
    await DB.prepare('DELETE FROM images WHERE counter_id = ?').bind(params.id).run();
    await DB.prepare('DELETE FROM tap_events WHERE counter_id = ?').bind(params.id).run();
    await DB.prepare('DELETE FROM counters WHERE id = ?').bind(params.id).run();
    return NextResponse.json({ ok: true });
  } catch {
    return jsonError('删除失败', 500);
  }
}
