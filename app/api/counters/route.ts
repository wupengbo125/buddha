import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ulid } from 'ulid';
import { getEnv } from '@/lib/runtime';
import { currentOwner, jsonError, readJson } from '@/lib/http';
import type { Counter } from '@/lib/types';

const SELECT_COUNTER =
  'SELECT id, device_id, name, caption, total, today, today_date, sound_enabled, created_at, updated_at FROM counters';

export async function GET(req: NextRequest) {
  const owner = await currentOwner(req);
  if (!owner) return jsonError('未登录', 401);
  try {
    const { DB } = getEnv();
    const base = 'SELECT c.id, c.device_id, c.name, c.caption, c.total, c.today, c.today_date, c.sound_enabled, c.created_at, c.updated_at, p.name AS title, p.prompts AS prompts, p.target AS target';
    const where = ' FROM counters c LEFT JOIN practices p ON p.id = c.id WHERE c.id IN (SELECT id FROM practices WHERE owner_id = ?) ORDER BY c.created_at ASC, c.id ASC';
    let res;
    try {
      res = await DB.prepare(`${base}, p.target_kind AS target_kind, p.target_seconds AS target_seconds, p.idle_seconds AS idle_seconds, p.min_seconds AS min_seconds${where}`).bind(owner).all<Counter>();
    } catch {
      // 兼容尚未执行 0008 迁移的库（老测试库只跑到 0004/0007）。
      res = await DB.prepare(`${base}${where}`).bind(owner).all<Counter>();
    }
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
  const owner = await currentOwner(req);
  if (!owner) return jsonError('未登录', 401);
  const parsed = CreateBody.safeParse(await readJson(req));
  if (!parsed.success) return jsonError('输入无效：name 必填且不超过 60 字', 400);
  try {
    const { DB } = getEnv();
    const id = ulid();
    const now = new Date().toISOString();
    // 新建默认开启该计数器音效（sound_enabled = 1）。
    await DB.prepare(
      'INSERT INTO counters (id, device_id, name, caption, total, today, today_date, sound_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, \'\', 1, ?, ?)',
    )
      .bind(id, owner, parsed.data.name, parsed.data.caption, now, now)
      .run();
    const counter = await DB.prepare(`${SELECT_COUNTER} WHERE id = ?`).bind(id).first<Counter>();
    return NextResponse.json({ counter }, { status: 201 });
  } catch {
    return jsonError('创建计数器失败', 500);
  }
}
