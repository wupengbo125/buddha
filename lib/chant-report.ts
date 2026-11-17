import { dateKey } from '@/lib/time';
import { PendingQueue } from '@/lib/storage';

// 念诵上报的唯一实现：次数模式与时长模式共用，event_id 生成规则、日期（时区）、请求体只定义一次。
export interface ReportOutcome {
  ok: boolean;
}

export type PendingChantReport = {
  eventId: string;
  counterId: string;
  date: string;
  path: 'minutes' | 'taps';
  amount: number; // minutes 或 taps 声数
};

const RETRY_DELAY_MS = 1500;

/** 待报批次折算成本模式的单位：时长批次是分钟（×60 变秒），次数批次就是声数。 */
export function reportDisplayAmount(report: PendingChantReport): number {
  return report.path === 'minutes' ? report.amount * 60 : report.amount;
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

function reportBody(report: PendingChantReport): object {
  return report.path === 'minutes'
    ? { event_id: report.eventId, minutes: report.amount, date: report.date }
    : { event_id: report.eventId, delta: report.amount, date: report.date };
}

async function sendReport(report: PendingChantReport): Promise<ReportOutcome> {
  return post(`/api/counters/${encodeURIComponent(report.counterId)}/${report.path}`, reportBody(report));
}

/** 时长模式：一批整分钟记到某个发愿上。 */
export function reportCounterMinutes(counterId: string, minutes: number, timeZone: string): Promise<ReportOutcome> {
  return sendReport({
    eventId: eventId('min', counterId, minutes),
    counterId,
    path: 'minutes',
    amount: minutes,
    date: dateKey(new Date(), timeZone),
  });
}

/** 次数模式：一批声数记到某个发愿上。 */
export function reportCounterTaps(counterId: string, taps: number, timeZone: string): Promise<ReportOutcome> {
  return sendReport({
    eventId: eventId('taps', counterId, taps),
    counterId,
    path: 'taps',
    amount: taps,
    date: dateKey(new Date(), timeZone),
  });
}

export type ReporterEvent =
  | { type: 'confirmed'; report: PendingChantReport }
  | { type: 'rejected'; report: PendingChantReport }
  | { type: 'retry'; message: string }
  | { type: 'idle' };

// 可靠上报：待报批次持久化到 localStorage，失败按同一 event_id 定时重试（端点幂等，重发不会重复计数）。
// 弱网、刷新、关闭页面都不丢；仅在明确 4xx（输入无效/非时长模式）时丢弃该批，避免死循环。
export class ChantReporter {
  private queue: PendingQueue<PendingChantReport>;
  private listeners = new Set<(event: ReporterEvent) => void>();
  private sending = false;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>, key: string) {
    this.queue = new PendingQueue(storage, key);
  }

  subscribe(listener: (event: ReporterEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(event: ReporterEvent) {
    for (const listener of this.listeners) listener(event);
  }

  get size(): number {
    return this.queue.size;
  }

  /** 入队一批并尽快上报。eventId 由调用方生成，重试时复用。 */
  add(report: PendingChantReport) {
    this.queue.add(report);
    void this.flush();
  }

  async flush(): Promise<void> {
    if (this.sending || this.stopped) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.sending = true;
    try {
      while (!this.stopped && this.queue.size) {
        const report = this.queue.values()[0];
        try {
          const response = await fetch(`/api/counters/${encodeURIComponent(report.counterId)}/${report.path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reportBody(report)),
          });
          if (response.ok) {
            this.queue.remove(report.eventId);
            this.emit({ type: 'confirmed', report });
            continue;
          }
          if (response.status >= 400 && response.status < 500) {
            // 请求本身无效，重试也不会成功：丢弃，避免永久卡住队列。
            this.queue.remove(report.eventId);
            this.emit({ type: 'rejected', report });
            continue;
          }
          throw new Error('上报失败');
        } catch {
          throw new Error('上报失败');
        }
      }
      if (!this.stopped) this.emit({ type: 'idle' });
    } catch (error) {
      if (!this.stopped) {
        const message = error instanceof Error ? error.message : '上报失败';
        this.emit({ type: 'retry', message });
        this.timer = setTimeout(() => { void this.flush(); }, RETRY_DELAY_MS);
      }
    } finally {
      this.sending = false;
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.listeners.clear();
  }
}
