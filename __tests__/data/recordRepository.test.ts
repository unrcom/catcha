import { createRecordRepository, RecordError } from '../../src/data/recordRepository';
import { createFakeQuery, createFakeSupabase } from '../helpers/fakeSupabase';

const USER = 'user-1';

const rows = [
  { id: 'r2', user_id: USER, played_at: '2026-11-03T11:15:00.000Z', duration_ms: 750_000, memo: 'ミケとトラ', client_id: 'c2' },
  { id: 'r1', user_id: USER, played_at: '2026-11-02T10:02:00.000Z', duration_ms: 365_000, memo: null, client_id: 'c1' },
];

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('recordRepository', () => {
  it('saves one record per session with an idempotent upsert (FR5.3)', async () => {
    const { client, from } = createFakeSupabase();
    const query = createFakeQuery({ data: null, error: null });
    from.mockReturnValue(query.builder);

    await createRecordRepository(client).save(USER, { clientId: 'c3', playedAt: '2026-11-03T12:00:00.000Z', durationMs: 300_000 });

    expect(from).toHaveBeenCalledWith('records');
    expect(query.calls).toEqual([
      {
        method: 'upsert',
        args: [
          { user_id: USER, client_id: 'c3', played_at: '2026-11-03T12:00:00.000Z', duration_ms: 300_000 },
          { onConflict: 'user_id,client_id', ignoreDuplicates: true },
        ],
      },
    ]);
  });

  it('lists only this user’s records, newest first (FR6.1)', async () => {
    const { client, from } = createFakeSupabase();
    const query = createFakeQuery({ data: rows, error: null });
    from.mockReturnValue(query.builder);

    const records = await createRecordRepository(client).list(USER);

    expect(records.map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(records[0]).toEqual({ id: 'r2', playedAt: rows[0].played_at, durationMs: 750_000, memo: 'ミケとトラ', clientId: 'c2' });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['user_id', USER] });
    expect(query.calls).toContainEqual({ method: 'order', args: ['played_at', { ascending: false }] });
  });

  it('updates the memo and returns the stored value (FR6.2)', async () => {
    const { client, from } = createFakeSupabase();
    const query = createFakeQuery({ data: { ...rows[1], memo: 'シロ' }, error: null });
    from.mockReturnValue(query.builder);

    const updated = await createRecordRepository(client).updateMemo(USER, 'r1', '  シロ  ');

    expect(updated.memo).toBe('シロ');
    expect(query.calls[0]).toEqual({ method: 'update', args: [{ memo: 'シロ' }] });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['id', 'r1'] });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['user_id', USER] });
  });

  it('turns a connection failure into a network RecordError', async () => {
    const { client, from } = createFakeSupabase();
    from.mockReturnValue(createFakeQuery({ data: null, error: { message: 'TypeError: Network request failed' } }).builder);
    await expect(createRecordRepository(client).list(USER)).rejects.toMatchObject({ name: 'RecordError', kind: 'network' });
  });

  it('turns other failures into a server RecordError and rejects bad durations', async () => {
    const { client, from } = createFakeSupabase();
    from.mockReturnValue(createFakeQuery({ data: null, error: { message: 'permission denied', code: '42501' } }).builder);
    const repo = createRecordRepository(client);
    await expect(repo.save(USER, { clientId: 'c', playedAt: rows[0].played_at, durationMs: 1 })).rejects.toBeInstanceOf(RecordError);
    await expect(repo.save(USER, { clientId: 'c', playedAt: rows[0].played_at, durationMs: -5 })).rejects.toThrow(RangeError);
  });
});
