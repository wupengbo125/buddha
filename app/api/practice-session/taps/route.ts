import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/runtime';
import { jsonError, readJson } from '@/lib/http';
import { practiceOwner, practiceResponse } from '@/lib/practice-http';
import { practiceTap, sessionDate } from '@/lib/practice-session';

export async function POST(req: NextRequest) {
  const owner = await practiceOwner(req);
  if (!owner) return jsonError('未登录', 401);
  try { return NextResponse.json(await practiceTap(getEnv().DB, owner, await readJson(req), sessionDate(req.nextUrl))); }
  catch (error) { return practiceResponse(error); }
}