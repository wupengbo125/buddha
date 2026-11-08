// 跨前后端共享的数据结构

export interface Counter {
  id: string;
  device_id: string;
  name: string;
  caption: string;
  total: number;
  today: number;
  today_date: string;
  created_at: string;
  updated_at: string;
}

export interface TapResult {
  total: number;
  today: number;
  today_date: string;
  event_id: string;
  applied: boolean;
}

export interface ImageView {
  id: string;
  url: string;
  content_type: string | null;
  created_at: string;
}
