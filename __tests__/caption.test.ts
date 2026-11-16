import { describe, expect, it } from 'vitest';
import { captionAt, parsePrompts } from '@/lib/caption';

describe('弹幕取词', () => {
  it('每敲一下换一条并循环，空项被跳过', () => {
    const prompts = ['一', ' ', '二'];
    expect(captionAt(prompts, '兜底', 0)).toBe('一');
    expect(captionAt(prompts, '兜底', 1)).toBe('二');
    expect(captionAt(prompts, '兜底', 2)).toBe('一');
  });

  it('第一次敲击显示第一条：调用方传本次敲击数，取词前减 1', () => {
    const prompts = ['第一句', '第二句', '第三句'];
    // useChant 的 nextCaptionText 传 (本次敲击数 - 1)，首次敲击 = 1 → index 0。
    expect(captionAt(prompts, '兜底', 1 - 1)).toBe('第一句');
    expect(captionAt(prompts, '兜底', 2 - 1)).toBe('第二句');
    expect(captionAt(prompts, '兜底', 3 - 1)).toBe('第三句');
  });

  it('没有弹幕时回到名称或说明，坏 JSON 不崩', () => {
    expect(captionAt([], '名称', 5)).toBe('名称');
    expect(parsePrompts('not json')).toEqual([]);
    expect(parsePrompts('["a", 1, "b"]')).toEqual(['a', 'b']);
  });
});
