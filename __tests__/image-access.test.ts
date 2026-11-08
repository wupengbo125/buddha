import { describe, expect, it } from 'vitest';
import { imageUrlFor } from '@/lib/image-access';

describe('v3 · 图片回显 URL（session cookie 鉴权，不带 device_id）', () => {
  it('生成 /api/img/<key>，URL 不含 device_id', () => {
    expect(imageUrlFor('c1/01HZX-avatar.png')).toBe('/api/img/c1/01HZX-avatar.png');
    expect(imageUrlFor('c1/abc.png')).not.toContain('device_id');
  });

  it('保留 key 中的路径分段与文件名', () => {
    expect(imageUrlFor('c1/sub/pic.jpg')).toBe('/api/img/c1/sub/pic.jpg');
  });

  it('同一 key 每次生成一致（跨请求一致）', () => {
    expect(imageUrlFor('c1/abc.png')).toBe(imageUrlFor('c1/abc.png'));
  });
});
