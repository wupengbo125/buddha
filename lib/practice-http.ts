import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OWNER_ID } from './auth';
import { requireSession, jsonError } from './http';

export class PracticeError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function practiceOwner(req: NextRequest): Promise<string | null> {
  return await requireSession(req) ? OWNER_ID : null;
}

export function practiceResponse(error: unknown): NextResponse {
  if (error instanceof PracticeError) return jsonError(error.message, error.status);
  if (error instanceof z.ZodError) return jsonError('输入无效', 400);
  return jsonError('操作失败', 500);
}