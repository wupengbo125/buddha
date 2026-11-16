import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/runtime';
import { jsonError, readJson } from '@/lib/http';
import { practiceOwner, practiceResponse } from '@/lib/practice-http';
import { createWishlist, listWishlists } from '@/lib/wishlist';

export async function GET(req: NextRequest) {
  const owner = await practiceOwner(req);
  if (!owner) return jsonError('未登录', 401);
  try { return NextResponse.json(await listWishlists(getEnv().DB, owner)); }
  catch (error) { return practiceResponse(error); }
}

export async function POST(req: NextRequest) {
  const owner = await practiceOwner(req);
  if (!owner) return jsonError('未登录', 401);
  try { return NextResponse.json(await createWishlist(getEnv().DB, owner, await readJson(req)), { status: 201 }); }
  catch (error) { return practiceResponse(error); }
}
