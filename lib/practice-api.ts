import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from './runtime';
import { jsonError, readJson } from './http';
import { practiceOwner, practiceResponse } from './practice-http';
import { deleteContent, editContent, ownedContent, ownedRow, withdrawContent } from './practice-store';
import { reviewContent } from './practice-moderation';
import { copyContent } from './practice-copy';
import { changeInteraction } from './practice-discovery';
import { z } from 'zod';

export type PracticeContext = { params: Promise<{ id: string }> };

export const detailHandlers = {
  async GET(req: NextRequest, context: PracticeContext) {
    const owner = await practiceOwner(req);
    if (!owner) return jsonError('未登录', 401);
    try { return NextResponse.json(await ownedContent(getEnv().DB, (await context.params).id, owner)); }
    catch (error) { return practiceResponse(error); }
  },
  async PATCH(req: NextRequest, context: PracticeContext) {
    const owner = await practiceOwner(req);
    if (!owner) return jsonError('未登录', 401);
    try {
      const db = getEnv().DB;
      const id = (await context.params).id;
      const previous = await ownedRow(db, id, owner);
      const edited = await editContent(db, id, owner, await readJson(req));
      return NextResponse.json(previous.approved_snapshot || previous.visibility === 'pending' ? await reviewContent(db, id, owner) : edited);
    }
    catch (error) { return practiceResponse(error); }
  },
  async POST(req: NextRequest, context: PracticeContext) {
    const owner = await practiceOwner(req);
    if (!owner) return jsonError('未登录', 401);
    try {
      const body = z.object({ action: z.enum(['publish', 'unpublish', 'copy', 'like', 'favorite', 'restart', 'zero']), enabled: z.boolean().optional().default(true) }).parse(await readJson(req));
      const id = (await context.params).id;
      if (body.action === 'like' || body.action === 'favorite') return NextResponse.json(await changeInteraction(getEnv().DB, id, owner, body.action, body.enabled));
      if (body.action === 'copy') return NextResponse.json(await copyContent(getEnv().DB, id, owner));
      if (body.action === 'zero') {
        // 归零：今日与累计清零，同时把已完成状态退回未完成。
        const now = new Date().toISOString();
        const db = getEnv().DB;
        if (!db.batch) throw new Error('D1 batch is required');
        await db.batch([
          db.prepare('UPDATE counters SET total = 0, today = 0, updated_at = ? WHERE id = ?').bind(now, id),
          db.prepare('UPDATE practices SET round_done = 0, updated_at = ? WHERE id = ? AND owner_id = ?').bind(now, id, owner),
        ]);
        return NextResponse.json({ ok: true });
      }
      if (body.action === 'restart') {
        // 再念一次：只清「本轮完成」状态，累计与今日不动。
        await getEnv().DB.prepare('UPDATE practices SET round_done = 0 WHERE id = ? AND owner_id = ?').bind(id, owner).run();
        return NextResponse.json({ ok: true });
      }
      if (body.action === 'unpublish') return NextResponse.json(await withdrawContent(getEnv().DB, id, owner));
      return NextResponse.json(await reviewContent(getEnv().DB, id, owner));
    } catch (error) { return practiceResponse(error); }
  },
  async DELETE(req: NextRequest, context: PracticeContext) {
    const owner = await practiceOwner(req);
    if (!owner) return jsonError('未登录', 401);
    try {
      const { DB, IMAGES } = getEnv();
      await deleteContent(DB, (await context.params).id, owner, IMAGES);
      return NextResponse.json({ ok: true });
    } catch (error) { return practiceResponse(error); }
  },
};
