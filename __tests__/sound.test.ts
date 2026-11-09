import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefersReducedMotion, shouldPlaySound, shouldVibrate } from '@/lib/sound';

describe('shouldPlaySound', () => {
  it('开启音效', () => {
    expect(shouldPlaySound(true)).toBe(true);
  });

  it('关闭音效', () => {
    expect(shouldPlaySound(false)).toBe(false);
  });
});

describe('shouldVibrate · reduced-motion 抑制震动', () => {
  it('音效开启且无 reduce → 震动', () => {
    expect(shouldVibrate(true, false)).toBe(true);
  });

  it('reduced-motion → 不震动', () => {
    expect(shouldVibrate(true, true)).toBe(false);
  });

  it('总开关 off → 不震动', () => {
    expect(shouldVibrate(false, false)).toBe(false);
    expect(shouldVibrate(false, true)).toBe(false);
  });
});

describe('prefersReducedMotion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('无 window（node 测试环境）→ false', () => {
    vi.stubGlobal('window', undefined);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('matchMedia 命中 reduce → true', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    expect(prefersReducedMotion()).toBe(true);
  });

  it('matchMedia 未命中 → false', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    expect(prefersReducedMotion()).toBe(false);
  });
});
