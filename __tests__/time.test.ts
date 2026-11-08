import { describe, expect, it } from 'vitest';
import { dateKey, msUntilNextDay } from '@/lib/time';

describe('dateKey 按配置时区计算日期键', () => {
  it('UTC+8 跨零点落到次日', () => {
    // 2026-01-01T16:00:00Z = 北京时间 2026-01-02 00:00
    expect(dateKey(new Date('2026-01-01T16:00:00Z'), 'Asia/Shanghai')).toBe('2026-01-02');
    expect(dateKey(new Date('2026-01-01T16:00:00Z'), 'UTC')).toBe('2026-01-01');
  });

  it('非法时区回退 UTC，不抛错', () => {
    expect(dateKey(new Date('2026-03-05T12:00:00Z'), 'Not/AZone')).toBe('2026-03-05');
  });
});

describe('msUntilNextDay', () => {
  it('返回正数且不超过一天', () => {
    const ms = msUntilNextDay(new Date('2026-01-01T16:00:00Z'), 'UTC');
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000);
  });
});
