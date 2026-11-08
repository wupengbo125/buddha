import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/http';

/** 供前端判断登录态；未登录也返回 200 + authenticated:false。 */
export async function GET(req: NextRequest) {
  return NextResponse.json({ authenticated: await requireSession(req) });
}
