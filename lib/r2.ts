import { ulid } from 'ulid';
import type { R2BucketLike } from './db';

export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return (cleaned.slice(-120) || 'image');
}

/** 去 device_id 隔离后，key 不再含设备段。 */
export function imageKey(counterId: string, filename: string): string {
  return `${counterId}/${ulid()}-${safeFileName(filename)}`;
}

export async function uploadImage(
  bucket: R2BucketLike,
  key: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<void> {
  await bucket.put(key, body, { httpMetadata: { contentType } });
}
