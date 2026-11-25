import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ulid } from 'ulid';
import { getEnv } from '@/lib/runtime';
import { currentOwner, jsonError, readJson } from '@/lib/http';
import type { CounterTotals } from '@/lib/taps';

// 计数模式：delta = 本批敲击声数（本地攒满「最少坚持」才上报一次）。
// 时长模式：delta 由服务端按相邻敲击的真实间隔算秒数，前端报的数字不作数。
const TapBody = z.object({
  event_id: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  delta: z.number().int().min(1).max(10000).default(1),
  /** 本批真实念诵秒数（次数模式按时长记账用，和声数分开）。 */
  seconds: z.number().int().min(1).max(3600).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await currentOwner(req);
  if (!owner) return jsonError('未登录', 401);
  const { id } = await params;
  const parsed = TapBody.safeParse(await readJson(req));
  if (!parsed.success) return jsonError('输入无效', 400);
  const { event_id, date, delta: reported, seconds: spent } = parsed.data;
  try {
    const { DB } = getEnv();
    const practice = await DB.prepare('SELECT target_kind, idle_seconds FROM practices WHERE id = ? AND owner_id = ?').bind(id, owner).first<{ target_kind: string; idle_seconds: number }>();
    const exists = await DB.prepare('SELECT id, last_tap_at FROM counters WHERE id = ?').bind(id).first<{ id: string; last_tap_at: string | null }>();
    if (!exists || !practice) return jsonError('计数器不存在', 404);

    // 时长模式：只计入上一次敲击之后、且不超过超时时长的这段时间；超时部分不计。
    let delta = reported;
    if (practice.target_kind === 'time') {
      const idle = Math.min(60, Math.max(1, practice.idle_seconds || 10));
      const gap = exists.last_tap_at ? (Date.now() - Date.parse(exists.last_tap_at)) / 1000 : 0;
      delta = Math.max(0, Math.min(idle, Math.round(gap)));
    }

    // 只留最近的 event_id 防重发；累计由触发器加到 counters 的一个数上，不再逐条存流水。
    // 次数模式：counter 加声数，西游总账加客户端测得的真实秒数（不再按 1 声 2 秒折算）。
    const seconds = practice.target_kind === 'time' ? delta : (spent ?? reported * 2);
    const inserted = await DB.prepare(
      'INSERT OR IGNORE INTO tap_marks (counter_id, owner_id, event_id, delta, seconds, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(id, owner, event_id, delta, seconds, date, new Date().toISOString())
      .run();
    if (!inserted.success) return jsonError('上报失败', 500);
    // 防重记录只留 7 天，库不会随敲击无限变大。
    await DB.prepare('DELETE FROM tap_marks WHERE owner_id = ? AND created_at < ?').bind(owner, new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()).run();

    const applied = Number(inserted.meta?.changes ?? 0) > 0;
    if (!applied) {
      // 同 event_id 重发：明确返回当前值 applied=false，客户端据此安全确认、不重复累加。
      const current = await DB.prepare('SELECT total, today, today_date FROM counters WHERE id = ?')
        .bind(id)
        .first<CounterTotals>();
      return NextResponse.json({ ...current, event_id, applied: false });
    }

    const next = await DB.prepare('SELECT total, today, today_date FROM counters WHERE id = ?')
      .bind(id)
      .first<CounterTotals>();
    return NextResponse.json({ ...next, event_id, applied: true });
  } catch {
    return jsonError('上报失败', 500);
  }
}
