import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { D1Database } from '@/lib/db';
import { getEnv } from '@/lib/runtime';
import { requireSession, jsonError, readJson } from '@/lib/http';
import type { Counter } from '@/lib/types';
import { OWNER_ID } from '@/lib/auth';
import { atomic, ownedRow } from '@/lib/practice-store';
import { detailHandlers } from '@/lib/practice-api';
import { reviewContent } from '@/lib/practice-moderation';
import { practiceResponse } from '@/lib/practice-http';

const SELECT_COUNTER =
  'SELECT id, device_id, name, caption, total, today, today_date, sound_enabled, created_at, updated_at FROM counters';

type Ctx = { params: Promise<{ id: string }> };

async function ownedCounter(DB: D1Database, id: string): Promise<Counter | null> {
  return DB.prepare(`${SELECT_COUNTER} WHERE id = ? AND id IN (SELECT id FROM practices WHERE owner_id = ?)`).bind(id, OWNER_ID).first<Counter>();
}

const PatchBody = z
  .object({
    name: z.string().trim().min(1).max(10000).optional(),
    caption: z.string().max(1000).optional(),
    sound_enabled: z.union([z.literal(0), z.literal(1)]).optional(),
  })
  .refine((d) => d.name !== undefined || d.caption !== undefined || d.sound_enabled !== undefined, {
    message: '无可更新字段',
  });

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!(await requireSession(req))) return jsonError('未登录', 401);
  const { id } = await params;
  const parsed = PatchBody.safeParse(await readJson(req));
  if (!parsed.success) return jsonError('输入无效', 400);
  try {
    const { DB } = getEnv();
    const existing = await ownedCounter(DB, id);
    if (!existing) return jsonError('计数器不存在', 404);
    const previous = await ownedRow(DB, 'practices', id, OWNER_ID);

    const sets: string[] = [];
    const vals: unknown[] = [];
    const statements = [];
    const now = new Date().toISOString();
    if (parsed.data.name !== undefined) {
      sets.push('recitation = ?');
      vals.push(parsed.data.name);
    }
    if (parsed.data.caption !== undefined) {
      sets.push("prompts = json_set(prompts, '$[0]', ?)");
      vals.push(parsed.data.caption);
    }
    const textChanged = sets.length > 0;
    if (textChanged) {
      sets.push("visibility = CASE WHEN approved_snapshot IS NOT NULL OR visibility = 'pending' THEN 'pending' ELSE visibility END", 'revision = revision + 1', 'updated_at = ?');
      statements.push(DB.prepare(`UPDATE practices SET ${sets.join(', ')} WHERE id = ? AND owner_id = ?`)
        .bind(...vals, now, id, OWNER_ID));
    }
    if (parsed.data.sound_enabled !== undefined) {
      statements.push(DB.prepare('UPDATE counters SET sound_enabled = ?, updated_at = ? WHERE id = ?')
        .bind(parsed.data.sound_enabled, now, id));
    }
    await atomic(DB, statements);
    if (textChanged && (previous.approved_snapshot || previous.visibility === 'pending')) {
      await reviewContent(DB, 'practices', id, OWNER_ID);
    }

    const counter = await ownedCounter(DB, id);
    return NextResponse.json({ counter });
  } catch (error) {
    return practiceResponse(error);
  }
}

export const DELETE = detailHandlers('practices').DELETE;
