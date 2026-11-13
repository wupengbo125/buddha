import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/runtime';
import { jsonError } from '@/lib/http';
import { practiceOwner, practiceResponse } from '@/lib/practice-http';
import { favoriteList } from '@/lib/practice-discovery';

export async function GET(req: NextRequest) {
  const owner = await practiceOwner(req);
  if (!owner) return jsonError('未登录', 401);
  try { return NextResponse.json(await favoriteList(getEnv().DB, owner, req.nextUrl)); }
  catch (error) { return practiceResponse(error); }
}