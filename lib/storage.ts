import type { TapRequest } from './counter-store';

export interface PendingTap extends TapRequest {
  counterId: string;
}

/**
 * 失败重试队列：请求失败时把该次点击原样入队，重试 drain 出来的仍是同一个 {eventId, date}，
 * 沿用同一 event_id 上报 —— 服务端按 event_id 幂等，重试不重复累加。
 */
export class PendingQueue<Item extends { eventId: string }> {
  private items: Item[] = [];
  private rejected: Item[] = [];
  private order = 0;

  constructor(private storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>, private key = '') {}

  add(item: Item): void {
    if (this.storage) {
      this.storage.setItem(`${this.key}:${item.eventId}`, JSON.stringify({ item, time: Date.now(), order: this.order++ }));
    } else {
      this.items.push(item);
    }
  }

  values(): Item[] {
    if (this.storage) {
      const entries: { item: Item; time: number; order: number }[] = [];
      for (let index = 0; index < this.storage.length; index++) {
        const key = this.storage.key(index);
        if (key?.startsWith(`${this.key}:`)) entries.push(JSON.parse(this.storage.getItem(key)!) as typeof entries[number]);
      }
      return entries.sort((first, second) => first.time - second.time || first.order - second.order).map((entry) => entry.item);
    }
    return [...this.items];
  }

  remove(eventId: string): void {
    if (this.storage) this.storage.removeItem(`${this.key}:${eventId}`);
    else this.items = this.items.filter((item) => item.eventId !== eventId);
  }

  reject(item: Item): void {
    if (this.storage) {
      new PendingQueue<Item>(this.storage, `${this.key}-rejected`).add(item);
    } else {
      this.rejected.push(item);
    }
    this.remove(item.eventId);
  }

  get rejectedSize(): number {
    return this.storage ? new PendingQueue<Item>(this.storage, `${this.key}-rejected`).size : this.rejected.length;
  }

  drain(): Item[] {
    const out = this.values();
    for (const item of out) this.remove(item.eventId);
    return out;
  }

  get size(): number {
    return this.values().length;
  }
}

export class RetryQueue extends PendingQueue<PendingTap> {
  add(counterId: string, req: TapRequest): void;
  add(item: PendingTap): void;
  add(counterId: string | PendingTap, req?: TapRequest): void {
    super.add(typeof counterId === 'string' ? { counterId, ...req! } : counterId);
  }
}
