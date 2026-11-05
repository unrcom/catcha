import { readFileSync } from 'fs';
import { join } from 'path';

// NFR5：テーブル定義に「自分の行だけ読み書きできる」制限が入っていることをテキストで確かめる。
// 実際の Supabase での動作確認は Build and Test で行う（code-summary.md 参照）。
const sql = readFileSync(join(__dirname, '../../../../supabase/migrations/0001_records.sql'), 'utf8')
  .replace(/--.*$/gm, '') // コメントは判定に使わない
  .replace(/\s+/g, ' ')
  .toLowerCase();

function policyFor(action: string): string {
  const match = sql.match(new RegExp(`create policy "[^"]+" on public\\.records for ${action} [^;]*;`));
  if (!match) throw new Error(`no ${action} policy found`);
  return match[0];
}

describe('0001_records.sql (NFR5, FR5.3, FR6.1, FR6.2)', () => {
  it('creates the records table with the planned columns', () => {
    expect(sql).toContain('create table if not exists public.records');
    for (const column of ['id uuid', 'user_id uuid', 'played_at timestamptz', 'duration_ms integer', 'memo text', 'client_id text']) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain('unique (user_id, client_id)');
  });

  it('enables row level security on the table', () => {
    expect(sql).toContain('alter table public.records enable row level security');
    expect(sql).toContain('alter table public.records force row level security');
  });

  it.each(['select', 'update', 'delete'])('restricts %s to the owner of the row', (action) => {
    const policy = policyFor(action);
    expect(policy).toContain('to authenticated');
    expect(policy).toContain('using ((select auth.uid()) = user_id)');
  });

  it('only lets a user insert rows for themselves', () => {
    const policy = policyFor('insert');
    expect(policy).toContain('with check ((select auth.uid()) = user_id)');
  });

  it('gives anonymous users no access', () => {
    expect(sql).toContain('revoke all on public.records from anon');
    expect(sql).not.toMatch(/for (select|insert|update|delete|all) to (anon|public)/);
    expect(sql).not.toMatch(/using \(true\)/);
  });
});
