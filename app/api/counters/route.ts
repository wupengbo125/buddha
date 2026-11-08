import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ulid } from 'ulid';
import { getEnv } from '@/lib/runtime';
import { requireSession, jsonError, readJson } from '@/lib/http';
import { OWNER_ID } from '@/lib/auth';
import type { Counter } from '@/lib/types';

const SELECT_COUNTER =
  'SELECT id, device_id, name, caption, total, today, today_date, created_at, updated_at FROM counters';

export async function GET(req: NextRequest) {
  if (!(await requireSession(req))) return jsonError('未登录', 401);
  try {
    const { DB } = getEnv();
    // 单账号一份数据：不再按 device_id 过滤，手机 / 电脑登同一账号看到同一份。
    const res = await DB.prepare(`${SELECT_COUNTER} ORDER BY created_at ASC, id ASC`).all<Counter>();
    return NextResponse.json({ counters: res.results ?? [] });
  } catch {
    return jsonError('获取计数器失败', 500);
  }
}

const CreateBody = z.object({
  name: z.string().trim().min(1).max(60),
  caption: z.string().max(200).optional().default(''),
});

export async function POST(req: NextRequest) {
  if (!(await requireSession(req))) return jsonError('未登录', 401);
  const parsed = CreateBody.safeParse(await readJson(req));
  if (!parsed.success) return jsonError('输入无效：name 必填且不超过 60 字', 400);
  try {
    const { DB } = getEnv();
    const id = ulid();
    const now = new Date().toISOString();
    await DB.prepare(
      "INSERT INTO counters (id, device_id, name, caption, total, today, today_date, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, '', ?, ?)",
    )
      .bind(id, OWNER_ID, parsed.data.name, parsed.data.caption, now, now)
      .run();
    const counter = await DB.prepare(`${SELECT_COUNTER} WHERE id = ?`).bind(id).first<Counter>();
    return NextResponse.json({ counter }, { status: 201 });
  } catch {
    return jsonError('创建计数器失败', 500);
  }
}
