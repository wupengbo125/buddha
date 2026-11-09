import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storageNamespace } from '@/lib/brand';
import { applyTheme, isTheme, readTheme, resolveTheme, saveTheme, THEME_KEY } from '@/lib/theme';

// node 环境没有 DOM / localStorage，用最小桩验证纯逻辑，不引 jsdom。
function fakeRoot() {
  const attrs = new Map<string, string>();
  return {
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
    getAttribute: (k: string) => attrs.get(k) ?? null,
    hasAttribute: (k: string) => attrs.has(k),
  };
}

function stubWindow(initial: Record<string, string> = {}, dark = false, throwOnGet = false) {
  const map = new Map(Object.entries(initial));
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => {
        if (throwOnGet) throw new Error('storage blocked');
        return map.get(k) ?? null;
      },
      setItem: (k: string, v: string) => void map.set(k, v),
    },
    matchMedia: (_q: string) => ({ matches: dark }),
  });
  return map;
}

let root: ReturnType<typeof fakeRoot>;

beforeEach(() => {
  root = fakeRoot();
  stubWindow();
  vi.stubGlobal('document', { documentElement: root });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('主题 key / 取值校验', () => {
  it('THEME_KEY 由 storageNamespace 派生', () => {
    expect(THEME_KEY).toBe(`${storageNamespace}:theme`);
    expect(THEME_KEY.startsWith(`${storageNamespace}:`)).toBe(true);
  });

  it('isTheme 只认 system / light / dark', () => {
    expect(isTheme('system')).toBe(true);
    expect(isTheme('light')).toBe(true);
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('neon')).toBe(false);
    expect(isTheme('DARK')).toBe(false);
    expect(isTheme('')).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(1)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
});

describe('readTheme / saveTheme', () => {
  it('未设置默认 system', () => {
    expect(readTheme()).toBe('system');
  });

  it('读取三态合法值', () => {
    const key = `${storageNamespace}:theme`;
    stubWindow({ [key]: 'light' });
    expect(readTheme()).toBe('light');
    stubWindow({ [key]: 'dark' });
    expect(readTheme()).toBe('dark');
    stubWindow({ [key]: 'system' });
    expect(readTheme()).toBe('system');
  });

  it('非法值回退 system', () => {
    stubWindow({ [`${storageNamespace}:theme`]: 'neon' });
    expect(readTheme()).toBe('system');
  });

  it('localStorage 抛错仍回退 system', () => {
    stubWindow({}, false, true);
    expect(readTheme()).toBe('system');
  });

  it('saveTheme 写入派生 key，readTheme 读回（system/light/dark 三态）', () => {
    for (const t of ['system', 'light', 'dark'] as const) {
      const map = stubWindow();
      saveTheme(t);
      expect(map.get(`${storageNamespace}:theme`)).toBe(t);
      expect(readTheme()).toBe(t);
    }
  });
});

describe('applyTheme · data-theme 设置与删除', () => {
  it('light / dark 设 data-theme，system 删除', () => {
    applyTheme('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    applyTheme('light');
    expect(root.getAttribute('data-theme')).toBe('light');
    applyTheme('system');
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(root.getAttribute('data-theme')).toBeNull();
  });

  it('system 在已有显式值后也能删除，回到媒体查询接管', () => {
    applyTheme('dark');
    applyTheme('system');
    expect(root.hasAttribute('data-theme')).toBe(false);
  });
});

describe('resolveTheme', () => {
  it('显式值原样返回，system 借助 matchMedia', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
    stubWindow({}, true);
    expect(resolveTheme('system')).toBe('dark');
    stubWindow({}, false);
    expect(resolveTheme('system')).toBe('light');
  });
});

describe('SSR 安全（无 window / document）', () => {
  it('读写与解析安全回退、不抛错', () => {
    vi.unstubAllGlobals();
    expect(readTheme()).toBe('system');
    expect(resolveTheme('system')).toBe('light');
    expect(() => saveTheme('dark')).not.toThrow();
    expect(() => applyTheme('dark')).not.toThrow();
  });
});
