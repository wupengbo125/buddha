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
  recitation: string;
  prompts: string[];
  target: number;
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

export interface Collection {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  visibility: PracticeVisibility;
  source_id?: string | null;
  source_name?: string | null;
  source_owner_id?: string | null;
  items: Practice[];
  total_target: number;
  likes: number;
  liked: boolean;
  favorited: boolean;
  reviews?: PracticeReview[];
  progress?: Pick<Run, 'id' | 'index' | 'completed' | 'counts' | 'total'> | null;
}

export interface Run {
  id: string;
  collection_id: string;
  collection_name: string;
  index: number;
  completed: boolean;
  count: number;
  items: Practice[];
  counts: number[];
  total: number;
}

export interface PracticeSessionState {
  active: Run | null;
  stats: { today: number; total: number };
  revision: number;
  date: string;
}