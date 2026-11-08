import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Database, R2BucketLike, Env } from './db';
import { getLocalD1, getLocalR2 } from './local';

/**
 * 取 D1 / R2 绑定。生产走 OpenNext Cloudflare 上下文；本地 next dev / 测试退化为内存实现。
 * 必须在请求处理函数内调用，切勿在模块顶层访问绑定。
 */
export function getEnv(): Env {
  try {
    const { env } = getCloudflareContext();
    const e = env as unknown as { DB?: D1Database; IMAGES?: R2BucketLike };
    if (e && e.DB && typeof e.DB.prepare === 'function') {
      return {
        DB: e.DB,
        IMAGES: e.IMAGES ?? getLocalR2(),
      };
    }
  } catch {
    // 不在 Cloudflare 运行时
  }
  return { DB: getLocalD1(), IMAGES: getLocalR2() };
}
