/**
 * 記録の保存・一覧・メモ（FR5.3, FR6.1, FR6.2）。
 * 行ごとのアクセス制限（supabase/migrations/0001_records.sql）で自分の行だけが返るが、
 * 念のため user_id でも絞る。
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeMemo, type NewRecord, type PlayRecord } from '../domain/records';
import { isNetworkError } from './supabase';

export type RecordErrorKind = 'network' | 'server';

export class RecordError extends Error {
  constructor(
    readonly kind: RecordErrorKind,
    readonly operation: string,
    cause?: unknown,
  ) {
    super(`${operation} failed (${kind})`);
    this.name = 'RecordError';
    (this as { cause?: unknown }).cause = cause;
  }
}

type RecordRow = {
  id: string;
  user_id: string;
  played_at: string;
  duration_ms: number;
  memo: string | null;
  client_id: string;
};

const COLUMNS = 'id, user_id, played_at, duration_ms, memo, client_id';

function toRecord(row: RecordRow): PlayRecord {
  return {
    id: row.id,
    playedAt: row.played_at,
    durationMs: row.duration_ms,
    memo: row.memo,
    clientId: row.client_id,
  };
}

export type RecordRepository = {
  /** 1回の遊びを1件保存する。同じ clientId を二度送っても1件のまま。 */
  save(userId: string, record: NewRecord): Promise<void>;
  /** 自分の記録を新しい順に返す。 */
  list(userId: string): Promise<PlayRecord[]>;
  updateMemo(userId: string, recordId: string, memo: string): Promise<PlayRecord>;
};

export function createRecordRepository(client: SupabaseClient): RecordRepository {
  async function call<T>(
    operation: string,
    action: () => PromiseLike<{ data: T; error: unknown }>,
  ): Promise<T> {
    let result: { data: T; error: unknown };
    try {
      result = await action();
    } catch (thrown) {
      throw new RecordError(isNetworkError(thrown) ? 'network' : 'server', operation, thrown);
    }
    if (result.error) {
      const kind = isNetworkError(result.error) ? 'network' : 'server';
      console.warn(`[records] ${operation} failed`, result.error);
      throw new RecordError(kind, operation, result.error);
    }
    return result.data;
  }

  return {
    async save(userId, record) {
      if (!Number.isInteger(record.durationMs) || record.durationMs < 0) {
        throw new RangeError(`invalid durationMs: ${record.durationMs}`);
      }
      await call('save', () =>
        client.from('records').upsert(
          {
            user_id: userId,
            client_id: record.clientId,
            played_at: record.playedAt,
            duration_ms: record.durationMs,
          },
          { onConflict: 'user_id,client_id', ignoreDuplicates: true },
        ),
      );
    },

    async list(userId) {
      const rows = await call<RecordRow[] | null>('list', () =>
        client
          .from('records')
          .select(COLUMNS)
          .eq('user_id', userId)
          .order('played_at', { ascending: false }),
      );
      return (rows ?? []).map(toRecord);
    },

    async updateMemo(userId, recordId, memo) {
      const value = normalizeMemo(memo);
      const row = await call<RecordRow | null>('updateMemo', () =>
        client
          .from('records')
          .update({ memo: value })
          .eq('id', recordId)
          .eq('user_id', userId)
          .select(COLUMNS)
          .single(),
      );
      if (!row) throw new RecordError('server', 'updateMemo');
      return toRecord(row);
    },
  };
}
