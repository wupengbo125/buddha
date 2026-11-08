import { describe, expect, it } from 'vitest';
import { imageUrl, ownsImage, resolveImageDeviceId } from '@/lib/image-access';

describe('R3 · 图片回显 device_id 校验与归属', () => {
  it('?device_id= query 合法即可（<img src> 无法带头）', () => {
    expect(resolveImageDeviceId('DEV_01', null)).toBe('DEV_01');
  });

  it('X-Device-Id 头也可，query 缺失时取头', () => {
    expect(resolveImageDeviceId(null, 'DEV_02')).toBe('DEV_02');
  });

  it('二者取其一即可，不要求同时', () => {
    expect(resolveImageDeviceId('DEV_01', 'DEV_02')).toBe('DEV_01');
  });

  it('query 非法但头合法时回退到头', () => {
    expect(resolveImageDeviceId('bad id!', 'DEV_02')).toBe('DEV_02');
  });

  it('缺失 / 非法 → null（调用方回 400）', () => {
    expect(resolveImageDeviceId(null, null)).toBeNull();
    expect(resolveImageDeviceId('', null)).toBeNull();
    expect(resolveImageDeviceId('bad/id', null)).toBeNull();
    expect(resolveImageDeviceId('bad id!', 'bad/id')).toBeNull();
  });

  it('记录不存在 / device_id 不一致 → 404（ownsImage=false）', () => {
    expect(ownsImage(null, 'd1')).toBe(false);
    expect(ownsImage({ device_id: 'd2' }, 'd1')).toBe(false);
    expect(ownsImage({ device_id: 'd1' }, 'd1')).toBe(true);
  });

  it('图片 url 生成处带 device_id，供 <img> 直接使用', () => {
    expect(imageUrl('d1/c1/abc.png', 'DEV_01')).toBe('/api/img/d1/c1/abc.png?device_id=DEV_01');
    expect(imageUrl('d1/c1/abc.png', 'a b')).toBe('/api/img/d1/c1/abc.png?device_id=a%20b');
  });
});
