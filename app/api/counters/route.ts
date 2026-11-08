import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ulid } from 'ulid';
import { getEnv } from '@/lib/runtime';
import { getDeviceId, jsonError, readJson } from '@/lib/http';
import type { Counter } from '@/lib/types';

const SELECT_COUNTER =
  'SELECT id, device_id, name, caption, total, today, today_date, created_at, updated_at FROM counters';

export async function GET(req: NextRequest) {
  try {
    const deviceId = getDeviceId(req);
    if (!deviceId) return jsonError('device_id 缺失或非法', 400);
    const { DB } = getEnv();
    const res = await DB.prepare(`${SELECT_COUNTER} WHERE device_id = ? ORDER BY created_at ASC, id ASC`)
      .bind(deviceId)
      .all<Counter>();
    return NextResponse.json({ counters: res.results ?? [] });
  } catch {
    return jsonError('获取计数器失败', 500);
  }
}

const CreateBody = z.object({
  device_id: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  caption: z.string().max(200).optional().default(''),
});

export async function POST(req: NextRequest) {
  const parsed = CreateBody.safeParse(await readJson(req));
  if (!parsed.success) return jsonError('输入无效：name 必填且不超过 60 字', 400);
  const deviceId = getDeviceId(req, { device_id: parsed.data.device_id });
  if (!deviceId) return jsonError('device_id 缺失或非法', 400);
  try {
    const { DB } = getEnv();
    const id = ulid();
    const now = new Date().toISOString();
    await DB.prepare(
      "INSERT INTO counters (id, device_id, name, caption, total, today, today_date, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, '', ?, ?)",
    )
      .bind(id, deviceId, parsed.data.name, parsed.data.caption, now, now)
      .run();
    const counter = await DB.prepare(`${SELECT_COUNTER} WHERE id = ? AND device_id = ?`)
      .bind(id, deviceId)
      .first<Counter>();
    return NextResponse.json({ counter }, { status: 201 });
  } catch {
    return jsonError('创建计数器失败', 500);
  }
}
