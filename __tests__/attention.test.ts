import { describe, expect, it } from 'vitest';
import { ATTENTION_MAX_MS, ATTENTION_MIN_MS, attentionDelay } from '@/lib/attention';

describe('专注提醒间隔', () => {
  it('随机落在 3–5 分钟之间', () => {
    expect(attentionDelay(() => 0)).toBe(ATTENTION_MIN_MS);
    expect(attentionDelay(() => 0.999999)).toBeLessThan(ATTENTION_MAX_MS);
    for (let i = 0; i < 50; i += 1) {
      const value = attentionDelay();
      expect(value).toBeGreaterThanOrEqual(ATTENTION_MIN_MS);
      expect(value).toBeLessThan(ATTENTION_MAX_MS);
    }
  });
});
