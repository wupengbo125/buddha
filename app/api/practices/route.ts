import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/runtime';
import { jsonError, readJson } from '@/lib/http';
import { practiceOwner, practiceResponse } from '@/lib/practice-http';
import { createPractice, listPractices } from '@/lib/practice-store';

export async function GET(req: NextRequest) {
  const owner = await practiceOwner(req);
  if (!owner) return jsonError('未登录', 401);
  try { return NextResponse.json(await listPractices(getEnv().DB, owner)); }
  catch (error) { return practiceResponse(error); }
}

export async function POST(req: NextRequest) {
  const owner = await practiceOwner(req);
  if (!owner) return jsonError('未登录', 401);
  try { return NextResponse.json(await createPractice(getEnv().DB, owner, await readJson(req)), { status: 201 }); }
  catch (error) { return practiceResponse(error); }
}