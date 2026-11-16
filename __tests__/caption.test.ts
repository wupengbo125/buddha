import { describe, expect, it } from 'vitest';
import { captionAt, parsePrompts } from '@/lib/caption';

describe('弹幕取词', () => {
  it('每敲一下换一条并循环，空项被跳过', () => {
    const prompts = ['一', ' ', '二'];
    expect(captionAt(prompts, '兜底', 0)).toBe('一');
    expect(captionAt(prompts, '兜底', 1)).toBe('二');
    expect(captionAt(prompts, '兜底', 2)).toBe('一');
  });

  it('没有弹幕时回到名称或说明，坏 JSON 不崩', () => {
    expect(captionAt([], '名称', 5)).toBe('名称');
    expect(parsePrompts('not json')).toEqual([]);
    expect(parsePrompts('["a", 1, "b"]')).toEqual(['a', 'b']);
  });
});
