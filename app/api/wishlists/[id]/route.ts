import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/runtime';
import { jsonError, readJson } from '@/lib/http';
import { practiceOwner, practiceResponse } from '@/lib/practice-http';
import { deleteWishlist, updateWishlist } from '@/lib/wishlist';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: Context) {
  const owner = await practiceOwner(req);
  if (!owner) return jsonError('未登录', 401);
  try { return NextResponse.json(await updateWishlist(getEnv().DB, (await context.params).id, owner, await readJson(req))); }
  catch (error) { return practiceResponse(error); }
}

export async function DELETE(req: NextRequest, context: Context) {
  const owner = await practiceOwner(req);
  if (!owner) return jsonError('未登录', 401);
  try {
    await deleteWishlist(getEnv().DB, (await context.params).id, owner);
    return NextResponse.json({ ok: true });
  } catch (error) { return practiceResponse(error); }
}
