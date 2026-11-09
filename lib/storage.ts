// 上报失败请求的待重试队列（纯内存纯逻辑，便于单测）。
// v6 不再把计数状态持久化到 localStorage：计数以服务端为唯一权威，关页面时最多丢弃队列中
// 尚未上报成功的点击，换取「每次上传」的极简，不重建 localStorage 对账恢复状态机。

import type { TapRequest } from './counter-store';

export interface PendingTap extends TapRequest {
  counterId: string;
}

/**
 * 失败重试队列：请求失败时把该次点击原样入队，重试 drain 出来的仍是同一个 {eventId, date}，
 * 沿用同一 event_id 上报 —— 服务端按 event_id 幂等，重试不重复累加。
 */
export class RetryQueue {
  private items: PendingTap[] = [];

  add(counterId: string, req: TapRequest): void {
    this.items.push({ counterId, ...req });
  }

  /** 取出并清空全部待重试请求（调用方逐个重发）。 */
  drain(): PendingTap[] {
    const out = this.items;
    this.items = [];
    return out;
  }

  get size(): number {
    return this.items.length;
  }
}
