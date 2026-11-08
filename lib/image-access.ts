// 图片回显 URL 生成。v3 起鉴权统一走 session cookie（<img src> 自动携带），
// URL 不再带 device_id；回显接口只校验「key 存在于 images 表」。

/** 回显 URL 不带 device_id，靠 session cookie 鉴权。 */
export function imageUrlFor(r2Key: string): string {
  return `/api/img/${r2Key}`;
}
