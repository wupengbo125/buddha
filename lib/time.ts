/** 按给定时区计算 YYYY-MM-DD 日期键（纯函数）。非法时区回退到 UTC。 */
export function dateKey(now: Date, timeZone: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** 距离本地下一个零点的毫秒数，用于设定零点的 setTimeout。按 24h 估算，配合周期性复核兜底 DST。 */
export function msUntilNextDay(now: Date, timeZone: string): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    return 60 * 1000;
  }
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const elapsed = ((get('hour') * 60 + get('minute')) * 60 + get('second')) * 1000 + now.getMilliseconds();
  return Math.max(1000, 24 * 60 * 60 * 1000 - elapsed + 100);
}
