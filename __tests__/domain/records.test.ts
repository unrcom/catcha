import {
  createClientId,
  formatDuration,
  formatPlayedAt,
  formatPlayedAtSpoken,
  normalizeMemo,
  recentAverageMs,
  sortNewestFirst,
  type PlayRecord,
} from '../../src/domain/records';

function makeRecord(overrides: Partial<PlayRecord>): PlayRecord {
  return {
    id: 'r1',
    playedAt: new Date(2026, 10, 1, 21, 40).toISOString(),
    durationMs: 60_000,
    memo: null,
    clientId: 'c1',
    ...overrides,
  };
}

describe('recentAverageMs (FR6.1 直近3回の平均)', () => {
  it('averages the three newest records, ignoring older ones', () => {
    const records = [
      makeRecord({ id: 'old', playedAt: new Date(2026, 9, 1).toISOString(), durationMs: 3_600_000 }),
      makeRecord({ id: 'a', playedAt: new Date(2026, 10, 3, 20, 15).toISOString(), durationMs: 750_000 }),
      makeRecord({ id: 'b', playedAt: new Date(2026, 10, 2, 19, 2).toISOString(), durationMs: 365_000 }),
      makeRecord({ id: 'c', playedAt: new Date(2026, 10, 1, 21, 40).toISOString(), durationMs: 445_000 }),
    ];
    // (750 + 365 + 445) / 3 = 520 秒 = 8分40秒
    expect(recentAverageMs(records)).toBe(520_000);
    expect(formatDuration(recentAverageMs(records)!)).toBe('8分40秒');
  });

  it('returns null when there are fewer than three records', () => {
    expect(recentAverageMs([])).toBeNull();
    expect(recentAverageMs([makeRecord({}), makeRecord({ id: 'r2' })])).toBeNull();
  });
});

describe('formatDuration (FR5.2 遊んだ時間の表示)', () => {
  it('formats minutes and zero-padded seconds', () => {
    expect(formatDuration(750_000)).toBe('12分30秒');
    expect(formatDuration(365_000)).toBe('6分05秒');
    expect(formatDuration(300_000)).toBe('5分00秒');
  });

  it('shows seconds only under one minute and truncates milliseconds', () => {
    expect(formatDuration(0)).toBe('0秒');
    expect(formatDuration(45_999)).toBe('45秒');
  });

  it('has no upper limit (FR4.3) and rejects invalid values', () => {
    expect(formatDuration(75 * 60_000)).toBe('75分00秒');
    expect(() => formatDuration(-1)).toThrow(RangeError);
    expect(() => formatDuration(Number.NaN)).toThrow(RangeError);
  });
});

describe('date formatting and ordering', () => {
  it('formats the played-at date for the list and for screen readers', () => {
    const iso = new Date(2026, 10, 3, 20, 15).toISOString(); // 2026-11-03 は火曜日
    expect(formatPlayedAt(iso)).toBe('11/3(火) 20:15');
    expect(formatPlayedAtSpoken(iso)).toBe('11月3日 20時15分');
    expect(() => formatPlayedAt('not a date')).toThrow(RangeError);
  });

  it('sorts newest first without mutating the input', () => {
    const older = makeRecord({ id: 'older', playedAt: new Date(2026, 10, 1).toISOString() });
    const newer = makeRecord({ id: 'newer', playedAt: new Date(2026, 10, 2).toISOString() });
    const input = [older, newer];
    expect(sortNewestFirst(input).map((r) => r.id)).toEqual(['newer', 'older']);
    expect(input.map((r) => r.id)).toEqual(['older', 'newer']);
  });
});

describe('memo and client id', () => {
  it('trims the memo, turns blank into null and rejects too long memos', () => {
    expect(normalizeMemo('  ミケとトラ ')).toBe('ミケとトラ');
    expect(normalizeMemo('   ')).toBeNull();
    expect(() => normalizeMemo('あ'.repeat(201))).toThrow(RangeError);
  });

  it('creates distinct client ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createClientId(1000)));
    expect(ids.size).toBe(50);
  });
});
