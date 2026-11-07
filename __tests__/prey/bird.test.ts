import { birdPose, type BirdState } from '../../src/prey/behaviors/birdHop';
import { BIRD_MOTION, BIRD_SIZE, birdKind } from '../../src/prey/kinds/bird';
import { PREY_KIND_IDS } from '../../src/prey/kinds';
import type { World } from '../../src/prey/types';
import { createWorld, touchWorld } from '../../src/prey/world';
import { MOTION } from '../../src/ui/toyMotion';
import { evenly } from '../helpers/preyCounts';

const tablet = { width: 1024, height: 768 };
const phone = { width: 390, height: 844 };
const STEP_MS = 16;
const bird = birdKind.behavior;
/** いつも真ん中の値を返す乱数（向きを振らない・範囲の真ん中を選ぶ） */
const middle = () => 0.5;

/** 画面の真ん中で止まっている（次のフレームで跳ねる）小鳥を作る。 */
function restingBird(at = { x: 512, y: 384 }, heading = 0, now = 0): BirdState {
  const state = bird.create({ field: tablet, isTablet: true, scale: BIRD_SIZE.tablet, now, rand: middle, order: 0 });
  Object.assign(state, { mode: 'rest', x: at.x, y: at.y, heading, restUntil: now, entering: false });
  return state;
}

/** from から ms だけ、1 フレームずつ進める。返した合図を集める。 */
function run(state: BirdState, field: typeof tablet, from: number, ms: number, rand: () => number = middle) {
  const cues: string[] = [];
  let now = from;
  for (let t = 0; t < ms; t += STEP_MS) {
    now += STEP_MS;
    const cue = bird.step(state, field, now, STEP_MS / 1000, rand);
    if (cue) cues.push(cue);
  }
  return { now, cues };
}

describe('小鳥 (FR2.1〜FR2.8)', () => {
  it('is one of the kinds, with its numbers in the definition and the phone scale (FR1.4, FR2.7, FR2.8)', () => {
    expect(PREY_KIND_IDS).toContain('bird');
    expect(BIRD_MOTION).toMatchObject({ hopLength: 40, hopMs: 150, restMs: [300, 900], noticeRadius: 150, fleeSpeed: 900, edgeTurn: 40, returnMs: [2_000, 5_000] });
    expect(BIRD_SIZE.phone).toBeLessThan(BIRD_SIZE.tablet);
    const p = createWorld({ counts: evenly(5), field: phone, isTablet: false, now: 0, rand: middle });
    const t = createWorld({ counts: evenly(5), field: tablet, isTablet: true, now: 0, rand: middle });
    const sizeOf = (w: World) => (w.agents.find((a) => a.kind === 'bird')!.state as BirdState).size;
    expect(sizeOf(p)).toBe(BIRD_SIZE.phone);
    expect(sizeOf(t)).toBe(BIRD_SIZE.tablet);
  });

  it('hops 40 pt in 0.15 s, then rests 0.3 to 0.9 s, with a hop sound (FR2.1, FR2.6)', () => {
    const state = restingBird();
    const first = bird.step(state, tablet, 16, 0.016, middle);
    expect(first).toBe('hop');
    expect(state.mode).toBe('hop');
    // 跳ねの途中は浮いていて、0.15 秒で着地する
    bird.step(state, tablet, 16 + 75, 0.016, middle);
    expect(birdPose(state, 16 + 75).lift).toBeCloseTo(1);
    bird.step(state, tablet, 16 + 150, 0.016, middle);
    expect(state.mode).toBe('rest');
    expect(Math.hypot(state.x - 512, state.y - 384)).toBeCloseTo(40);
    expect(state.restUntil - (16 + 150)).toBe(600);

    // 止まる時間は 0.3〜0.9 秒の中から選ぶ
    for (const r of [0, 0.999]) {
      const s = restingBird();
      bird.step(s, tablet, 16, 0.016, middle);
      bird.step(s, tablet, 200, 0.016, () => r);
      expect(s.restUntil - 200).toBeGreaterThanOrEqual(300);
      expect(s.restUntil - 200).toBeLessThanOrEqual(900);
    }
  });

  it('flees from a touch within 150 pt, but not from one farther away (FR2.2)', () => {
    const near = restingBird();
    expect(bird.react!(near, { x: 512 + 149, y: 384 }, tablet, 0, middle)).toBe('flap');
    expect(near.mode).toBe('flee');

    const far = restingBird();
    expect(bird.react!(far, { x: 512 + 151, y: 384 }, tablet, 0, middle)).toBeNull();
    expect(far.mode).toBe('rest');
  });

  it('is caught for 0.4 s when the touch hits it, then flees with a flap (FR2.2, FR4.2)', () => {
    const w = createWorld({ counts: evenly(5), field: tablet, isTablet: true, now: 0, rand: middle });
    const state = w.agents.find((a) => a.kind === 'bird')!.state as BirdState;
    Object.assign(state, restingBird({ x: 300, y: 300 }, 0, 1_000));
    const result = touchWorld(w, { x: 310, y: 300 }, tablet, 1_000, middle);
    expect(result.hit).toBe(true);
    expect(w.ripples).toHaveLength(1);
    expect(state.mode).toBe('caught');
    expect(state.caughtUntil).toBe(1_000 + MOTION.catchMs);

    const { cues } = run(state, tablet, 1_000, MOTION.catchMs - 20);
    expect(state.mode).toBe('caught');
    expect(state.x).toBe(300);
    expect(cues).toEqual([]);
    const after = run(state, tablet, 1_000 + MOTION.catchMs - 20, 40);
    expect(after.cues).toEqual(['flap']);
    expect(state.mode).toBe('flee');
    // 触れた位置（右）から離れる向き（左）へ逃げる
    expect(state.vx).toBeLessThan(0);
  });

  it('flies away from the touch at 900 pt/s and leaves the screen (FR2.3)', () => {
    const state = restingBird({ x: 400, y: 400 });
    bird.react!(state, { x: 400 - 60, y: 400 - 80 }, tablet, 0, middle);
    expect(Math.hypot(state.vx, state.vy)).toBeCloseTo(900);
    // 触れた位置（左上）から離れる向き（右下）
    expect(state.vx).toBeCloseTo(900 * 0.6);
    expect(state.vy).toBeCloseTo(900 * 0.8);
    const x0 = state.x;
    bird.step(state, tablet, 100, 0.1, middle);
    expect(state.x - x0).toBeCloseTo(54);
    run(state, tablet, 100, 2_000);
    expect(state.mode).toBe('away');
    expect(bird.isVisible(state)).toBe(false);
    expect(bird.isOnScreen(state, tablet)).toBe(false);
  });

  it('turns around at 40 pt from a screen edge while walking (FR2.4)', () => {
    // 左の端の近くで、左を向いて止まっている
    const left = restingBird({ x: 60, y: 384 }, Math.PI);
    bird.step(left, tablet, 16, 0.016, middle);
    expect(left.hopTo.x).toBeCloseTo(100);
    expect(left.dir).toBe(1);

    // 下の端の近くで、下を向いて止まっている（スマートフォンの画面）
    const bottom = restingBird({ x: 200, y: phone.height - 50 }, Math.PI / 2);
    bird.step(bottom, phone, 16, 0.016, middle);
    expect(bottom.hopTo.y).toBeCloseTo(phone.height - 90);

    // 1 分歩き回っても、端から 40 点より外へは出ない
    const walker = restingBird({ x: 100, y: 100 }, Math.PI * 1.25);
    let x = 0.13;
    const wobble = () => (x = (x * 9301 + 49297) % 233280) / 233280;
    let now = 0;
    for (let i = 0; i < 3_750; i += 1) {
      now += STEP_MS;
      bird.step(walker, tablet, now, STEP_MS / 1000, wobble);
      expect(walker.x).toBeGreaterThanOrEqual(40 - 1e-9);
      expect(walker.x).toBeLessThanOrEqual(tablet.width - 40 + 1e-9);
      expect(walker.y).toBeGreaterThanOrEqual(40 - 1e-9);
      expect(walker.y).toBeLessThanOrEqual(tablet.height - 40 + 1e-9);
    }
  });

  it.each([0, 0.999])('walks back in from an edge 2 to 5 s after fleeing off-screen (FR2.5, rand %p)', (r) => {
    const state = restingBird({ x: 980, y: 384 });
    bird.react!(state, { x: 900, y: 384 }, tablet, 0, middle);
    let now = 0;
    while (state.mode === 'flee') now = run(state, tablet, now, STEP_MS, () => r).now;
    const leftAt = now;
    const wait = state.returnAt - leftAt;
    expect(wait).toBeGreaterThanOrEqual(2_000);
    expect(wait).toBeLessThanOrEqual(5_000);

    // 戻る時刻までは画面の外にいる
    now = run(state, tablet, now, wait - 100, () => r).now;
    expect(bird.isVisible(state)).toBe(false);
    // 戻る時刻を過ぎたら端に立ち、跳ねて画面に入ってくる
    let seenAt: number | null = null;
    for (let t = now; t < now + 3_000; t += STEP_MS) {
      bird.step(state, tablet, t, STEP_MS / 1000, () => r);
      if (seenAt === null && bird.isOnScreen(state, tablet)) seenAt = t;
    }
    expect(seenAt).not.toBeNull();
    expect(['hop', 'rest']).toContain(state.mode);
  });

  it('can be called back by the world when the screen has been empty', () => {
    const state = bird.create({ field: tablet, isTablet: true, scale: 1.6, now: 0, rand: middle, order: 0 });
    expect(bird.recallRank(state, 0)).toEqual({ tier: expect.any(Number), order: state.returnAt });
    bird.recall(state, tablet, 100);
    bird.step(state, tablet, 116, 0.016, middle);
    expect(bird.isVisible(state)).toBe(true);
    expect(bird.recallRank(state, 116)).toBeNull();
  });

  it('ignores touches while it is away, and does not lengthen the catch (edge cases)', () => {
    const away = bird.create({ field: tablet, isTablet: true, scale: 1.6, now: 0, rand: middle, order: 0 });
    expect(bird.distanceTo(away, { x: 0, y: 0 })).toBe(Number.POSITIVE_INFINITY);
    expect(bird.react!(away, { x: away.x, y: away.y }, tablet, 0, middle)).toBeNull();
    expect(away.mode).toBe('away');

    const caught = restingBird();
    bird.startle(caught, { x: 512, y: 384 }, tablet, 1_000, middle);
    bird.startle(caught, { x: 512, y: 384 }, tablet, 1_200, middle);
    expect(caught.caughtUntil).toBe(1_000 + MOTION.catchMs);
    // 真上に触れられたときも、どこかへ逃げる
    run(caught, tablet, 1_000, 500);
    expect(Math.hypot(caught.vx, caught.vy)).toBeCloseTo(900);
  });
});
