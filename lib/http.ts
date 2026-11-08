import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const DeviceIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** 从 X-Device-Id 头 / body / query 取设备标识并校验。缺失或非法返回 null。 */
export function getDeviceId(req: NextRequest, extra?: Record<string, unknown>): string | null {
  const header = req.headers.get('x-device-id');
  if (header && DeviceIdSchema.safeParse(header).success) return header;
  if (extra && typeof extra.device_id === 'string' && DeviceIdSchema.safeParse(extra.device_id).success) {
    return extra.device_id;
  }
  const q = new URL(req.url).searchParams.get('device_id');
  if (q && DeviceIdSchema.safeParse(q).success) return q;
  return null;
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
