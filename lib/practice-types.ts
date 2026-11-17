export type PracticeVisibility = 'private' | 'pending' | 'public' | 'rejected';

export interface PracticeReview {
  id: string;
  revision: number;
  status: 'pending' | 'approved' | 'rejected' | 'error' | 'stale';
  reason: string | null;
}

export interface Practice {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  prompts: string[];
  target: number;
  targetKind: 'count' | 'time';
  targetSeconds: number;
  idleSeconds: number;
  minSeconds: number;
  roundDone: boolean;
  /** 已完成的轮数（再念一次的基准）：进度条只算本轮，累计不清零。 */
  roundsDone?: number;
  visibility: PracticeVisibility;
  source_id?: string | null;
  source_name?: string | null;
  source_owner_id?: string | null;
  item_id?: string;
  likes: number;
  liked: boolean;
  favorited: boolean;
  personal_total?: number;
  today_total?: number;
  reviews?: PracticeReview[];
}
