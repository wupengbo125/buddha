import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from './runtime';
import { jsonError, readJson } from './http';
import { practiceOwner, practiceResponse } from './practice-http';
import { deleteContent, editContent, ownedContent, ownedRow, withdrawContent, type ContentKind } from './practice-store';
import { reviewContent } from './practice-moderation';
import { copyContent } from './practice-copy';
import { changeInteraction } from './practice-discovery';
import { z } from 'zod';

export type PracticeContext = { params: Promise<{ id: string }> };

export function detailHandlers(kind: ContentKind) {
  return {
    async GET(req: NextRequest, context: PracticeContext) {
      const owner = await practiceOwner(req);
      if (!owner) return jsonError('未登录', 401);
      try { return NextResponse.json(await ownedContent(getEnv().DB, kind, (await context.params).id, owner)); }
      catch (error) { return practiceResponse(error); }
    },
    async PATCH(req: NextRequest, context: PracticeContext) {
      const owner = await practiceOwner(req);
      if (!owner) return jsonError('未登录', 401);
      try {
        const db = getEnv().DB;
        const id = (await context.params).id;
        const previous = await ownedRow(db, kind, id, owner);
        const edited = await editContent(db, kind, id, owner, await readJson(req));
        return NextResponse.json(previous.approved_snapshot || previous.visibility === 'pending' ? await reviewContent(db, kind, id, owner) : edited);
      }
      catch (error) { return practiceResponse(error); }
    },
    async POST(req: NextRequest, context: PracticeContext) {
      const owner = await practiceOwner(req);
      if (!owner) return jsonError('未登录', 401);
      try {
        const body = z.object({ action: z.enum(['publish', 'unpublish', 'copy', 'like', 'favorite']), enabled: z.boolean().optional().default(true) }).parse(await readJson(req));
        if (body.action === 'like' || body.action === 'favorite') return NextResponse.json(await changeInteraction(getEnv().DB, kind, (await context.params).id, owner, body.action, body.enabled));
        if (body?.action === 'copy') return NextResponse.json(await copyContent(getEnv().DB, kind, (await context.params).id, owner));
        if (body?.action === 'unpublish') return NextResponse.json(await withdrawContent(getEnv().DB, kind, (await context.params).id, owner));
        if (body?.action !== 'publish') return jsonError('操作无效', 400);
        return NextResponse.json(await reviewContent(getEnv().DB, kind, (await context.params).id, owner));
      } catch (error) { return practiceResponse(error); }
    },
    async DELETE(req: NextRequest, context: PracticeContext) {
      const owner = await practiceOwner(req);
      if (!owner) return jsonError('未登录', 401);
      try {
        const { DB, IMAGES } = getEnv();
        await deleteContent(DB, kind, (await context.params).id, owner, IMAGES);
        return NextResponse.json({ ok: true });
      } catch (error) { return practiceResponse(error); }
    },
  };
}