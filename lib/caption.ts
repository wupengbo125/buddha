// 弹幕取词：次数/时长两种念诵共用一处逻辑；轮动时机只有一个——每敲一下换一条。
export function parsePrompts(raw: string): string[] {
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter((text): text is string => typeof text === 'string') : [];
  } catch {
    return [];
  }
}

export function captionAt(prompts: string[], fallback: string, beat: number): string {
  const nonempty = prompts.filter((text) => text.trim() !== '');
  if (!nonempty.length) return fallback;
  return nonempty[Math.abs(beat) % nonempty.length];
}
