// The small D1 surface used by caches and allowance reservations.
export interface Database {
 prepare(sql: string): {
  bind(...values: unknown[]): ReturnType<Database['prepare']>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{meta?: {changes?: number}}>;
 };
}
