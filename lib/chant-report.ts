import { dateKey } from '@/lib/time';

// 念诵上报的唯一实现：次数模式与时长模式共用，event_id 生成规则、日期（时区）、请求体只定义一次。
export interface ReportOutcome {
  ok: boolean;
}

async function post(path: string, body: unknown): Promise<ReportOutcome> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: response.ok };
  } catch {
    return { ok: false };
  }
}

function eventId(prefix: string, id: string, size: number): string {
  return `${prefix}-${id}-${Date.now()}-${size}`;
}

/** 时长模式：一批整分钟记到某个发愿上。 */
export function reportCounterMinutes(counterId: string, minutes: number, timeZone: string): Promise<ReportOutcome> {
  return post(`/api/counters/${counterId}/minutes`, {
    event_id: eventId('min', counterId, minutes),
    minutes,
    date: dateKey(new Date(), timeZone),
  });
}

/** 次数模式：一批声数记到某个发愿上。 */
export function reportCounterTaps(counterId: string, taps: number, timeZone: string): Promise<ReportOutcome> {
  return post(`/api/counters/${counterId}/taps`, {
    event_id: eventId('taps', counterId, taps),
    delta: taps,
    date: dateKey(new Date(), timeZone),
  });
}
