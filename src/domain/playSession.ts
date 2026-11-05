/**
 * 遊び1回の状態と時間の数え方（FR4.1〜FR4.5, FR5.1, FR3.2）。
 * 時刻（ミリ秒）はすべて引数で受け取る。状態は変更せず、新しい状態を返す。
 *
 * 状態：
 *   waiting  … 始まったが、まだネコが触っていない
 *   playing  … ネコが一度でも触った
 *   menu     … 飼い主メニューを開いている（自動で終わる判定は止める）
 *   ended    … 終わった
 *
 * 時間の数え方：
 *   - 遊んだ時間 = ネコが最初に触った時刻 〜 最後に触った時刻
 *   - 自動で終わるまでの起点 = 待機中は開始時刻、遊び中は最後に触った時刻、
 *     メニューを閉じたあとは閉じた時刻
 *   - メニュー中のネコのタッチは遊んだ時間に数えるが、メニューが自動で閉じるまでの数えは戻さない
 *   - 「α」と認識された指や、メニューのボタン操作は catTouch に渡さない（呼び出し側の責任）
 *   - 上限時間はない
 */

export type PlayPhase = 'waiting' | 'playing' | 'menu' | 'ended';
export type EndReason = 'idle' | 'owner';

export const MENU_AUTO_CLOSE_MS = 10_000;

export type PlaySession = Readonly<{
  phase: PlayPhase;
  idleMs: number;
  startedAt: number;
  firstTouchAt: number | null;
  lastTouchAt: number | null;
  /** 自動で終わるまでを数える起点 */
  idleAnchorAt: number;
  menuOpenedAt: number | null;
  endedAt: number | null;
  endReason: EndReason | null;
}>;

export type SessionOutcome =
  | { recorded: true; playedAt: string; durationMs: number }
  | { recorded: false };

export function startSession(now: number, idleSeconds: number): PlaySession {
  if (!Number.isFinite(idleSeconds) || idleSeconds <= 0) {
    throw new RangeError(`idleSeconds must be positive: ${idleSeconds}`);
  }
  return {
    phase: 'waiting',
    idleMs: idleSeconds * 1000,
    startedAt: now,
    firstTouchAt: null,
    lastTouchAt: null,
    idleAnchorAt: now,
    menuOpenedAt: null,
    endedAt: null,
    endReason: null,
  };
}

/** ネコが触った（「α」でなかった指の動き）。 */
export function catTouch(s: PlaySession, now: number): PlaySession {
  if (s.phase === 'ended') return s;
  const firstTouchAt = s.firstTouchAt ?? now;
  const lastTouchAt = Math.max(s.lastTouchAt ?? now, now);
  if (s.phase === 'menu') {
    // 自動で終わる判定は止めたまま。起点は閉じたときに決める。
    return { ...s, firstTouchAt, lastTouchAt };
  }
  return {
    ...s,
    phase: 'playing',
    firstTouchAt,
    lastTouchAt,
    idleAnchorAt: Math.max(s.idleAnchorAt, now),
  };
}

/** 「α」を認識した → 飼い主メニューを開く。 */
export function openMenu(s: PlaySession, now: number): PlaySession {
  if (s.phase !== 'waiting' && s.phase !== 'playing') return s;
  return { ...s, phase: 'menu', menuOpenedAt: now };
}

/** 「遊びに戻る」または10秒操作なし → メニューを閉じ、閉じた時刻から数え直す。 */
export function closeMenu(s: PlaySession, now: number): PlaySession {
  if (s.phase !== 'menu') return s;
  return {
    ...s,
    phase: s.firstTouchAt === null ? 'waiting' : 'playing',
    menuOpenedAt: null,
    idleAnchorAt: now,
  };
}

/** 「遊びを終える」。 */
export function endByOwner(s: PlaySession, now: number): PlaySession {
  if (s.phase === 'ended') return s;
  return { ...s, phase: 'ended', endedAt: now, endReason: 'owner', menuOpenedAt: null };
}

/**
 * 時間を進める。自動で終わる・メニューが自動で閉じるのはここで決まる。
 * fingersDown が true（指が画面に触れたまま）なら、自動では終わらない。
 */
export function tick(s: PlaySession, now: number, fingersDown = false): PlaySession {
  if (s.phase === 'menu') {
    if (s.menuOpenedAt !== null && now - s.menuOpenedAt >= MENU_AUTO_CLOSE_MS) {
      return closeMenu(s, s.menuOpenedAt + MENU_AUTO_CLOSE_MS);
    }
    return s;
  }
  if (s.phase === 'ended' || fingersDown) return s;
  if (now - s.idleAnchorAt >= s.idleMs) {
    return { ...s, phase: 'ended', endedAt: now, endReason: 'idle' };
  }
  return s;
}

/** 遊んだ時間（最初〜最後のタッチ）。触られていなければ 0。 */
export function playedMs(s: PlaySession): number {
  if (s.firstTouchAt === null || s.lastTouchAt === null) return 0;
  return s.lastTouchAt - s.firstTouchAt;
}

/** 自動で終わるまでの残り（メニュー中・終了後は null）。 */
export function remainingIdleMs(s: PlaySession, now: number): number | null {
  if (s.phase !== 'waiting' && s.phase !== 'playing') return null;
  return Math.max(0, s.idleMs - (now - s.idleAnchorAt));
}

/** メニューが自動で閉じるまでの残り秒数（表示用、切り上げ）。 */
export function menuSecondsLeft(s: PlaySession, now: number): number {
  if (s.phase !== 'menu' || s.menuOpenedAt === null) return 0;
  return Math.max(0, Math.ceil((MENU_AUTO_CLOSE_MS - (now - s.menuOpenedAt)) / 1000));
}

/** 終わった遊びを記録にするか。一度も触られなかったら記録しない（FR4.4）。 */
export function outcomeOf(s: PlaySession): SessionOutcome {
  if (s.firstTouchAt === null) return { recorded: false };
  return {
    recorded: true,
    playedAt: new Date(s.firstTouchAt).toISOString(),
    durationMs: playedMs(s),
  };
}
