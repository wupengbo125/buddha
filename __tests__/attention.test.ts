import { describe, expect, it } from 'vitest';
import { attentionDelay } from '@/lib/attention';

describe('别走神间隔', () => {
  it('0 档关闭', () => {
    expect(attentionDelay(0)).toBeNull();
  });

  it('N 档落在 N 分钟的 80%–120%', () => {
    for (const level of [1, 2, 3, 7, 15]) {
      const min = level * 60000 * 0.8;
      const max = level * 60000 * 1.2;
      expect(attentionDelay(level, () => 0)).toBe(min);
      expect(attentionDelay(level, () => 0.999999)).toBeLessThan(max);
      for (let i = 0; i < 30; i += 1) {
        const value = attentionDelay(level)!;
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThan(max);
      }
    }
  });
});
