import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/runtime';
import { practiceOwner, practiceResponse } from '@/lib/practice-http';
import { discoverList } from '@/lib/practice-discovery';

export async function GET(req: NextRequest) {
  try { return NextResponse.json(await discoverList(getEnv().DB, await practiceOwner(req), req.nextUrl)); }
  catch (error) { return practiceResponse(error); }
}