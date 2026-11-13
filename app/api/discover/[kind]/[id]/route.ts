import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/runtime';
import { jsonError } from '@/lib/http';
import { practiceOwner, practiceResponse } from '@/lib/practice-http';
import { discoverContent } from '@/lib/practice-discovery';

type Context = { params: Promise<{ kind: string; id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const { kind, id } = await context.params;
  if (kind !== 'practices' && kind !== 'collections') return jsonError('内容不存在', 404);
  try { return NextResponse.json(await discoverContent(getEnv().DB, kind, id, await practiceOwner(req))); }
  catch (error) { return practiceResponse(error); }
}