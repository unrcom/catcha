import {
  catTouch,
  closeMenu,
  endByOwner,
  MENU_AUTO_CLOSE_MS,
  menuSecondsLeft,
  openMenu,
  outcomeOf,
  playedMs,
  remainingIdleMs,
  startSession,
  tick,
  type PlaySession,
} from '../../src/domain/playSession';

const S = 1000;
const T0 = 1_000_000;

/** 時刻 from から to まで、1秒ごとに tick する。 */
function runUntil(s: PlaySession, from: number, to: number): PlaySession {
  let state = s;
  for (let now = from; now <= to && state.phase !== 'ended'; now += S) state = tick(state, now);
  return state;
}

describe('played time (FR5.1)', () => {
  it('counts only from the first to the last cat touch', () => {
    // 遊び画面が始まって10秒後に最初に触り、その5分後に最後に触り、30秒後に自動で終わった
    let s = startSession(T0, 30);
    s = catTouch(s, T0 + 10 * S);
    for (let t = T0 + 20 * S; t <= T0 + 310 * S; t += 10 * S) s = catTouch(tick(s, t), t);
    s = runUntil(s, T0 + 311 * S, T0 + 400 * S);

    expect(s.phase).toBe('ended');
    expect(s.endedAt).toBe(T0 + 340 * S);
    expect(playedMs(s)).toBe(300 * S);
    expect(outcomeOf(s)).toEqual({
      recorded: true,
      playedAt: new Date(T0 + 10 * S).toISOString(),
      durationMs: 300 * S,
    });
  });
});

describe('auto end (FR4.1, FR4.3, FR4.4)', () => {
  it('ends 30 s after the last touch, but continues if touched at 29 s (FR4.1)', () => {
    let s = catTouch(startSession(T0, 30), T0 + S);
    s = tick(s, T0 + 30 * S); // 最後に触ってから29秒
    expect(s.phase).toBe('playing');
    s = catTouch(s, T0 + 30 * S);
    expect(tick(s, T0 + 59 * S).phase).toBe('playing');
    const ended = tick(s, T0 + 60 * S);
    expect(ended.phase).toBe('ended');
    expect(ended.endReason).toBe('idle');
  });

  it('ends an untouched session 30 s after start and does not record it (FR4.4)', () => {
    const s = startSession(T0, 30);
    expect(tick(s, T0 + 29 * S).phase).toBe('waiting');
    const ended = tick(s, T0 + 30 * S);
    expect(ended.phase).toBe('ended');
    expect(outcomeOf(ended)).toEqual({ recorded: false });
  });

  it('uses the configured number of seconds (FR4.2)', () => {
    const s = catTouch(startSession(T0, 120), T0);
    expect(tick(s, T0 + 119 * S).phase).toBe('playing');
    expect(tick(s, T0 + 120 * S).phase).toBe('ended');
  });

  it('has no upper time limit while the cat keeps touching (FR4.3)', () => {
    let s = startSession(T0, 30);
    const threeHours = 3 * 60 * 60 * S;
    for (let t = T0; t <= T0 + threeHours; t += 20 * S) s = catTouch(tick(s, t), t);
    expect(s.phase).toBe('playing');
    expect(playedMs(s)).toBe(threeHours);
  });

  it('does not end while a finger is still on the screen', () => {
    const s = catTouch(startSession(T0, 30), T0);
    expect(tick(s, T0 + 45 * S, true).phase).toBe('playing');
  });

  it('rejects a non-positive idle time', () => {
    expect(() => startSession(T0, 0)).toThrow(RangeError);
  });
});

describe('owner menu (FR3.2, FR4.5)', () => {
  it('keeps the end of played time at the last cat touch when the owner draws α later (FR4.5)', () => {
    let s = catTouch(startSession(T0, 30), T0);
    s = catTouch(s, T0 + 60 * S);
    s = openMenu(tick(s, T0 + 80 * S), T0 + 80 * S); // 最後に触ってから20秒後に「α」
    expect(s.phase).toBe('menu');
    expect(playedMs(s)).toBe(60 * S);
    expect(s.lastTouchAt).toBe(T0 + 60 * S);
  });

  it('never auto-ends while the menu is open, and restarts the countdown when it closes (FR4.5)', () => {
    let s = catTouch(startSession(T0, 30), T0);
    s = openMenu(s, T0 + 25 * S);
    // 最後のタッチから30秒（T0+30s）を過ぎても、メニューを開いている間は終わらない
    for (let t = T0 + 26 * S; t <= T0 + 34 * S; t += S) s = tick(s, t);
    expect(s.phase).toBe('menu');
    expect(remainingIdleMs(s, T0 + 34 * S)).toBeNull();

    s = closeMenu(s, T0 + 34 * S);
    expect(s.phase).toBe('playing');
    expect(tick(s, T0 + 63 * S).phase).toBe('playing');
    expect(tick(s, T0 + 64 * S).phase).toBe('ended');
  });

  it('counts cat touches behind the menu without resetting the 10 s auto-close (FR4.5)', () => {
    let s = openMenu(startSession(T0, 30), T0 + 5 * S); // まだ触られていない
    s = catTouch(s, T0 + 8 * S); // メニューの後ろで最初のタッチ
    s = catTouch(s, T0 + 12 * S);
    expect(s.phase).toBe('menu');
    expect(playedMs(s)).toBe(4 * S);
    expect(menuSecondsLeft(s, T0 + 12 * S)).toBe(3);

    s = tick(s, T0 + 5 * S + MENU_AUTO_CLOSE_MS);
    expect(s.phase).toBe('playing'); // 触られていたので遊び中に戻る
    expect(s.idleAnchorAt).toBe(T0 + 15 * S);
  });

  it('returns to waiting when the menu closes before any cat touch', () => {
    const s = tick(openMenu(startSession(T0, 30), T0 + S), T0 + S + MENU_AUTO_CLOSE_MS);
    expect(s.phase).toBe('waiting');
  });

  it('ends the session when the owner chooses to end (FR3.2)', () => {
    const touched = endByOwner(openMenu(catTouch(startSession(T0, 30), T0), T0 + S), T0 + 2 * S);
    expect(touched).toMatchObject({ phase: 'ended', endReason: 'owner' });
    expect(outcomeOf(touched).recorded).toBe(true);

    const untouched = endByOwner(openMenu(startSession(T0, 30), T0 + S), T0 + 2 * S);
    expect(outcomeOf(untouched)).toEqual({ recorded: false });
  });

  it('ignores touches and menu actions after the session ended', () => {
    const ended = tick(startSession(T0, 30), T0 + 30 * S);
    expect(catTouch(ended, T0 + 31 * S)).toBe(ended);
    expect(openMenu(ended, T0 + 31 * S)).toBe(ended);
  });
});
