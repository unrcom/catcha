/**
 * 遊びの記録の形と、表示用の計算（FR5.2, FR5.3, FR6.1）。
 * 外部への依存はない純粋な関数だけを置く。
 */

/** サーバーに保存された記録（1回の遊び = 1件）。 */
export type PlayRecord = {
  id: string;
  /** 遊んだ日時（ISO 8601）。ネコが最初に触った時刻。 */
  playedAt: string;
  /** 遊んだ時間（ミリ秒）。最初〜最後のタッチ。 */
  durationMs: number;
  memo: string | null;
  /** 端末側で作る番号。二重送信を防ぐ。 */
  clientId: string;
};

/** まだサーバーに送っていない記録。 */
export type NewRecord = {
  clientId: string;
  playedAt: string;
  durationMs: number;
};

export const MEMO_MAX_LENGTH = 200;
export const RECENT_AVERAGE_COUNT = 3;

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** 新しい順（遊んだ日時の降順）に並べた新しい配列を返す。 */
export function sortNewestFirst(records: readonly PlayRecord[]): PlayRecord[] {
  return [...records].sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt));
}

/**
 * 直近3回の遊んだ時間の平均（ミリ秒、四捨五入）。
 * 3件に満たないときは null（画面では「3回遊ぶと平均が表示されます」）。
 */
export function recentAverageMs(records: readonly PlayRecord[]): number | null {
  if (records.length < RECENT_AVERAGE_COUNT) return null;
  const recent = sortNewestFirst(records).slice(0, RECENT_AVERAGE_COUNT);
  const total = recent.reduce((sum, r) => sum + r.durationMs, 0);
  return Math.round(total / RECENT_AVERAGE_COUNT);
}

/**
 * 遊んだ時間の表示。1分以上は「12分30秒」「6分05秒」、1分未満は「45秒」。
 * 秒未満は切り捨てる。上限はない（FR4.3）ので 60 分以上も「75分00秒」とする。
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new RangeError(`formatDuration: invalid duration ${ms}`);
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}秒`;
  return `${minutes}分${String(seconds).padStart(2, '0')}秒`;
}

/** 読み上げ用の時間（「12分30秒」と同じだが、0 埋めをしない）。 */
export function formatDurationSpoken(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes === 0 ? `${seconds}秒` : `${minutes}分${seconds}秒`;
}

/** 一覧の日時の表示：「11/3(火) 20:15」（端末の時刻で表示）。 */
export function formatPlayedAt(iso: string): string {
  const d = parseDate(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]}) ${hh}:${mm}`;
}

/** 読み上げ用の日時：「11月3日 20時15分」。 */
export function formatPlayedAtSpoken(iso: string): string {
  const d = parseDate(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}時${d.getMinutes()}分`;
}

/** メモの入力を整える：前後の空白を除き、空なら null。長すぎるときはエラー。 */
export function normalizeMemo(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MEMO_MAX_LENGTH) {
    throw new RangeError(`memo is longer than ${MEMO_MAX_LENGTH} characters`);
  }
  return trimmed;
}

/** 端末側で記録の番号を作る（二重送信の防止用。暗号用途ではない）。 */
export function createClientId(now: number = Date.now()): string {
  const random = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0');
  const random2 = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0');
  return `${now.toString(16)}-${random}${random2}`;
}

function parseDate(iso: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError(`invalid date: ${iso}`);
  }
  return d;
}
