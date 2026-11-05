import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase のクライアントのうち、このアプリが使う部分だけを真似る。
 * 返す値の形は supabase-js の { data, error } に合わせる。
 */
export type QueryResult = { data: unknown; error: unknown };

export type QueryCall = { method: string; args: unknown[] };

export function createFakeQuery(result: QueryResult | (() => Promise<QueryResult>)) {
  const calls: QueryCall[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'insert', 'upsert', 'update', 'eq', 'order', 'single']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (r: QueryResult) => unknown, reject: (e: unknown) => unknown) => {
    const p = typeof result === 'function' ? result() : Promise.resolve(result);
    return p.then(resolve, reject);
  };
  return { builder, calls };
}

export function createFakeSupabase() {
  const auth = {
    signUp: jest.fn(),
    signInWithPassword: jest.fn(),
    signOut: jest.fn(),
    getSession: jest.fn(),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
  };
  const from = jest.fn();
  const client = { auth, from } as unknown as SupabaseClient;
  return { client, auth, from };
}

/** supabase-js の AuthApiError に近い形のエラー。 */
export function authApiError(code: string, message: string, status = 400) {
  return Object.assign(new Error(message), { name: 'AuthApiError', code, status });
}

/** 通信できないときに supabase-js が返すエラー。 */
export function retryableFetchError() {
  return Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError', status: 0 });
}
