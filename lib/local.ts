// 本地 next dev / 单测兜底：node:sqlite 内存 D1 + Map 内存 R2。
// 仅当 getEnv() 拿不到 Cloudflare 绑定时才会走到这里；生产不会使用。

import type { D1Database, D1PreparedStatement, D1Result, R2BucketLike, R2Object } from './db';

// DDL 单一来源 = migrations/*.sql（wrangler 迁移与本地兜底共用）。
// 按文件名顺序读取全部迁移拼接，新增表/列只需加新迁移文件，本地内存 D1 自动跟上。
// 用 eval('require') 动态取 node 内置模块，避免被 OpenNext 静态打进 Worker bundle。
export function readSchemaSql(): string {
  const nodeRequire: (id: string) => any = eval('require');
  const fs = nodeRequire('node:fs');
  const path = nodeRequire('node:path');
  const dir = path.resolve(process.cwd(), 'migrations');
  const files = (fs.readdirSync(dir) as string[])
    .filter((f) => f.endsWith('.sql'))
    .sort();
  return files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8') as string).join('\n');
}

class SqlitePrepared implements D1PreparedStatement {
  private params: unknown[] = [];

  constructor(private sqlite: any, private query: string) {}

  bind(...params: unknown[]): D1PreparedStatement {
    this.params = params;
    return this;
  }

  async first<T = unknown>(col?: string): Promise<T | null> {
    const row = this.sqlite.prepare(this.query).get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (col ? (row[col] ?? null) : row) as T;
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    const results = this.sqlite.prepare(this.query).all(...this.params) as T[];
    return { results, success: true, meta: { changes: 0 } };
  }

  async run<T = unknown>(): Promise<D1Result<T>> {
    const res = this.sqlite.prepare(this.query).run(...this.params) as { changes: number };
    return { results: [], success: true, meta: { changes: Number(res.changes), changed_db: true } };
  }

  execute<T = unknown>(): D1Result<T> {
    const results = this.sqlite.prepare(this.query).all(...this.params) as T[];
    return { results, success: true };
  }
}

const noopStatement: D1PreparedStatement = {
  bind() {
    return noopStatement;
  },
  async first<T = unknown>(): Promise<T | null> {
    return null;
  },
  async all<T = unknown>(): Promise<D1Result<T>> {
    return { results: [], success: false, meta: { changes: 0 } };
  },
  async run<T = unknown>(): Promise<D1Result<T>> {
    return { results: [], success: false, meta: { changes: 0 } };
  },
};

const noopD1: D1Database = { prepare: () => noopStatement };

export function sqliteD1(sqlite: any): D1Database {
  return {
    prepare: (query: string) => new SqlitePrepared(sqlite, query),
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map((statement) => (statement as SqlitePrepared).execute<T>());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

function createSqliteD1(): D1Database | null {
  try {
    const nodeRequire: (id: string) => any = eval('require');
    const { DatabaseSync } = nodeRequire('node:sqlite');
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(readSchemaSql());
    return sqliteD1(sqlite);
  } catch {
    return null;
  }
}

let d1Cache: D1Database | undefined;
export function getLocalD1(): D1Database {
  if (!d1Cache) d1Cache = createSqliteD1() ?? noopD1;
  return d1Cache;
}

class MemoryR2 implements R2BucketLike {
  private store = new Map<string, { bytes: Uint8Array; contentType: string }>();

  async put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<void> {
    let bytes: Uint8Array;
    if (typeof value === 'string') bytes = new TextEncoder().encode(value);
    else if (value instanceof Uint8Array) bytes = value;
    else bytes = new Uint8Array(value);
    this.store.set(key, { bytes, contentType: options?.httpMetadata?.contentType ?? 'application/octet-stream' });
  }

  async get(key: string): Promise<R2Object | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    const bytes = entry.bytes;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    return { body, httpMetadata: { contentType: entry.contentType } };
  }

  async delete(key: string | string[]): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];
    for (const k of keys) this.store.delete(k);
  }
}

let r2Cache: R2BucketLike | undefined;
export function getLocalR2(): R2BucketLike {
  if (!r2Cache) r2Cache = new MemoryR2();
  return r2Cache;
}
