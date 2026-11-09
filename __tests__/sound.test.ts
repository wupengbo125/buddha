import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefersReducedMotion, shouldPlaySound, shouldVibrate } from '@/lib/sound';

describe('shouldPlaySound · 两级开关', () => {
  it('总开关 on 且计数器 on → 响', () => {
    expect(shouldPlaySound(true, true)).toBe(true);
  });

  it('总开关 off → 全静音（一键全关）', () => {
    expect(shouldPlaySound(false, true)).toBe(false);
  });

  it('计数器 off → 不响', () => {
    expect(shouldPlaySound(true, false)).toBe(false);
  });

  it('两级都 off → 不响', () => {
    expect(shouldPlaySound(false, false)).toBe(false);
  });

  it('reduced-motion 不影响音效（音效非 motion 类反馈）', () => {
    expect(shouldPlaySound(true, true, true)).toBe(true);
    expect(shouldPlaySound(false, true, true)).toBe(false);
  });
});

describe('shouldVibrate · reduced-motion 抑制震动', () => {
  it('两级开关都开且无 reduce → 震动', () => {
    expect(shouldVibrate(true, true, false)).toBe(true);
  });

  it('reduced-motion → 不震动', () => {
    expect(shouldVibrate(true, true, true)).toBe(false);
  });

  it('总开关 off → 不震动', () => {
    expect(shouldVibrate(false, true, false)).toBe(false);
  });

  it('计数器 off → 不震动', () => {
    expect(shouldVibrate(true, false, false)).toBe(false);
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
