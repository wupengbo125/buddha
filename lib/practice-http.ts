import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentOwner, jsonError } from './http';

export class PracticeError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function practiceOwner(req: NextRequest): Promise<string | null> {
  return currentOwner(req);
}

export function practiceResponse(error: unknown): NextResponse {
  if (error instanceof PracticeError) return jsonError(error.message, error.status);
  if (error instanceof z.ZodError) {
    const labels: Record<string, string> = { name: '名称', description: '描述', prompts: '弹幕', target: '目标次数',
      targetKind: '目标类型', targetSeconds: '目标时长', idleSeconds: '超时（秒）', minSeconds: '最少坚持', practiceIds: '发愿' };
    const issue = error.issues[0];
    const field = labels[String(issue?.path?.[0] ?? '')] ?? String(issue?.path?.join('.') ?? '');
    return jsonError(`输入无效${field ? `：${field}` : ''}${issue?.message ? `（${issue.message}）` : ''}`, 400);
  }
  return jsonError('操作失败', 500);
}