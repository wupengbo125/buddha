import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/runtime';
import { jsonError, readJson } from '@/lib/http';
import { practiceOwner, practiceResponse } from '@/lib/practice-http';
import { changeSession, sessionDate, sessionState } from '@/lib/practice-session';

export async function GET(req: NextRequest) {
  const owner = await practiceOwner(req);
  if (!owner) return jsonError('未登录', 401);
  try { return NextResponse.json(await sessionState(getEnv().DB, owner, sessionDate(req.nextUrl))); }
  catch (error) { return practiceResponse(error); }
}

export async function POST(req: NextRequest) {
  const owner = await practiceOwner(req);
  if (!owner) return jsonError('未登录', 401);
  try { return NextResponse.json(await changeSession(getEnv().DB, owner, await readJson(req), sessionDate(req.nextUrl))); }
  catch (error) { return practiceResponse(error); }
}