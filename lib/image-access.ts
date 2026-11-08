// 图片回显的归属校验纯逻辑。
// <img src> 无法带 X-Device-Id 头，故改用 ?device_id= query；其它接口仍可用头，二者取其一即可。

import { z } from 'zod';

export const ImageDeviceSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const ImageDeviceQuery = z.object({ device_id: ImageDeviceSchema });

/** query 或 X-Device-Id 头二者取其一即可；都缺失 / 非法返回 null（调用方回 400）。 */
export function resolveImageDeviceId(query: string | null, header: string | null): string | null {
  for (const value of [query, header]) {
    const parsed = ImageDeviceQuery.safeParse({ device_id: value });
    if (parsed.success) return parsed.data.device_id;
  }
  return null;
}

/** 图片记录存在且 device_id 与请求一致才放行，否则 404。 */
export function ownsImage(row: { device_id: string } | null, deviceId: string): boolean {
  return !!row && row.device_id === deviceId;
}

/** 生成带 device_id 的回显 URL，供 <img> 直接使用。 */
export function imageUrl(r2Key: string, deviceId: string): string {
  return `/api/img/${r2Key}?device_id=${encodeURIComponent(deviceId)}`;
}
