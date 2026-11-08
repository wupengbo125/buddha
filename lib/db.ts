// D1 / R2 的最小接口描述。生产由 Cloudflare 绑定提供，本地 next dev 退化为内存实现。

export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta?: {
    changes?: number;
    last_row_id?: number;
    duration?: number;
    size_after?: number;
    rows_read?: number;
    rows_written?: number;
    changed_db?: boolean;
  };
}

export interface D1PreparedStatement {
  bind(...params: unknown[]): D1PreparedStatement;
  first<T = unknown>(col?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface R2Object {
  body: ReadableStream<Uint8Array>;
  httpMetadata?: { contentType?: string };
}

export interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<R2Object | null>;
  delete(key: string | string[]): Promise<void>;
}

export interface Env {
  DB: D1Database;
  IMAGES: R2BucketLike;
}
