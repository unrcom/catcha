import { BIRD_JOINT_MOTION, type BirdAct, type BirdJointState } from '../../src/prey/behaviors/birdJoint';
import { BIRD_MOTION, BIRD_SIZE } from '../../src/prey/kinds/bird';
import { birdJointKind } from '../../src/prey/kinds/birdJoint';
import { PREY_KIND_IDS, preyKindOf } from '../../src/prey/kinds';
import type { World } from '../../src/prey/types';
import { MOTION } from '../../src/ui/toyMotion';
import { createWorld, pointWorld, stepWorld, touchWorld } from '../../src/prey/world';
import { RECALL_TIER } from '../../src/prey/types';

const tablet = { width: 1024, height: 768 };
const STEP_MS = 16;
const bird = birdJointKind.behavior;
const middle = () => 0.5;

function restingBird(at = { x: 512, y: 384 }, now = 0): BirdJointState {
  const state = bird.create({ field: tablet, isTablet: true, scale: BIRD_SIZE.tablet, now, rand: middle, order: 0 });
  Object.assign(state, { mode: 'rest', x: at.x, y: at.y, heading: 0, dir: 1, restUntil: now + 10_000, entering: false });
  return state;
}

function run(state: BirdJointState, from: number, ms: number, rand: () => number = middle, each?: (now: number) => void) {
  let now = from;
  for (let t = 0; t < ms; t += STEP_MS) {
    now += STEP_MS;
    bird.step(state, tablet, now, STEP_MS / 1000, rand);
    each?.(now);
  }
  return now;
}

/** 決まった並びの乱数（毎回同じ結果になる） */
function seeded(seed = 11): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

describe('関節のある小鳥', () => {
  it('is the bird of the kind list, with the id bird, in place of the old bird (no switch)', () => {
    expect(birdJointKind.id).toBe('bird');
    expect(PREY_KIND_IDS).toEqual(['string', 'tail', 'teaser', 'mouse', 'bird']);
    expect(PREY_KIND_IDS.filter((id) => id === 'bird')).toHaveLength(1);
    expect(preyKindOf('bird')).toBe(birdJointKind);
  });

  it('pecks the ground: leans forward and lowers the neck while resting', () => {
    const state = restingBird();
    // 止まり始め（着地）で、することを選ぶ。指がないとき rand 0.1 は「つつく」
    Object.assign(state, { mode: 'hop', hopFrom: { x: 512, y: 384 }, hopTo: { x: 552, y: 384 }, hopStart: 0, hopEnd: 150 });
    let deepest = 0;
    let lean = 0;
    run(state, 0, 700, () => 0.1, () => {
      deepest = Math.max(deepest, state.joints.neck);
      lean = Math.max(lean, state.joints.lean);
    });
    expect(deepest).toBeGreaterThan(0.9);
    expect(lean).toBeGreaterThan(0.5);
  });

  it('looks around: turns the head back and forth', () => {
    const state = restingBird();
    Object.assign(state, { mode: 'hop', hopFrom: { x: 512, y: 384 }, hopTo: { x: 552, y: 384 }, hopStart: 0, hopEnd: 150 });
    const turns: number[] = [];
    run(state, 0, 1_100, () => 0.7, () => turns.push(state.joints.headTurn));
    expect(Math.min(...turns)).toBeLessThan(-0.8);
    expect(Math.max(...turns)).toBeGreaterThan(0.8);
  });

  it('looks at the finger, and turns around when the finger is behind it', () => {
    const state = restingBird();
    // 指が左下（後ろ）にある
    bird.watch!(state, { x: 300, y: 500, at: 0 }, 0);
    Object.assign(state, { mode: 'hop', hopFrom: { x: 512, y: 384 }, hopTo: { x: 512, y: 384 }, hopStart: 0, hopEnd: 150 });
    run(state, 0, 600, () => 0.1);
    expect(state.act).toBe('look');
    expect(state.dir).toBe(-1);
    // 下にあるので頭は下がり、黒目は前を向く
    expect(state.joints.neck).toBeGreaterThan(0.2);
    expect(state.joints.eyeX).toBeGreaterThan(0);
  });

  it('jumps up, puffs out and shrinks when tapped, within the same 0.4 s as the other prey, then flees (FR2.2, FR4.2)', () => {
    const state = restingBird();
    bird.startle(state, { x: 512, y: 384 }, tablet, 0, middle);
    expect(state.mode).toBe('caught');
    expect(state.caughtUntil).toBe(MOTION.catchMs);
    let high = 0;
    let puff = 1;
    let small = 1;
    let wing = 0;
    const now = run(state, 0, MOTION.catchMs - 20, middle, () => {
      high = Math.max(high, state.joints.lift);
      puff = Math.max(puff, state.joints.puffY);
      small = Math.min(small, state.joints.puffY);
      wing = Math.max(wing, state.joints.wing);
    });
    expect(state.mode).toBe('caught');
    expect(high).toBeGreaterThan(25);
    expect(puff).toBeGreaterThan(1.35);
    expect(small).toBeLessThan(0.85);
    expect(wing).toBeGreaterThan(1);
    run(state, now, 60);
    expect(state.mode).toBe('flee');
  });

  it('flees leaning forward, flapping big and fast, rising and speeding up', () => {
    const state = restingBird();
    bird.react!(state, { x: 450, y: 384 }, tablet, 0, middle);
    expect(state.mode).toBe('flee');
    const wings: number[] = [];
    const x0 = state.x;
    run(state, 0, 80, middle, () => wings.push(state.joints.wing));
    const early = state.x - x0;
    const x1 = state.x;
    run(state, 80, 400, middle, () => wings.push(state.joints.wing));
    // 飛び立ちはゆっくり、あとで速く
    expect(early / 80).toBeLessThan((state.x - x1) / 400);
    expect(state.joints.lean).toBeGreaterThan(0.3);
    expect(state.joints.lift).toBeGreaterThan(30);
    expect(Math.max(...wings) - Math.min(...wings)).toBeGreaterThan(1.5);
  });

  it('keeps the latest finger position in the world for the birds to watch', () => {
    const w: World = { agents: [], ripples: [], emptySince: null, lastNow: 0, pointer: null };
    touchWorld(w, { x: 10, y: 20 }, tablet, 5);
    expect(w.pointer).toEqual({ x: 10, y: 20, at: 5 });
    pointWorld(w, { x: 30, y: 40 }, 9);
    expect(w.pointer).toEqual({ x: 30, y: 40, at: 9 });
  });

  it('rests 0.3–0.9 s, and longer only until its act ends (at most 1.0 s) (FR2.1, FR2.10)', () => {
    const state = restingBird();
    state.restUntil = 0;
    const rand = seeded();
    const rests: { act: BirdAct; ms: number }[] = [];
    let landed = -1;
    let act: BirdAct = 'idle';
    let before = state.mode;
    run(state, 0, 120_000, rand, (now) => {
      if (state.mode === 'rest' && before === 'hop') {
        landed = now;
        act = state.act;
      }
      if (state.mode === 'hop' && before === 'rest' && landed >= 0) rests.push({ act, ms: now - landed });
      before = state.mode;
    });
    const range = (a: BirdAct) => rests.filter((r) => r.act === a).map((r) => r.ms);
    // 4 つのどれもが何度も出る
    for (const a of ['idle', 'peck', 'scan'] as const) expect(range(a).length).toBeGreaterThan(5);
    const all = rests.map((r) => r.ms);
    // 1 フレーム（16 ミリ秒）の分だけ遅れて跳ね始めることがある
    expect(Math.min(...all)).toBeGreaterThanOrEqual(BIRD_MOTION.restMs[0]);
    expect(Math.max(...all)).toBeLessThanOrEqual(1_000 + STEP_MS);
    // 何もしないときは前の小鳥と同じ 0.3〜0.9 秒
    expect(Math.max(...range('idle'))).toBeLessThanOrEqual(BIRD_MOTION.restMs[1] + STEP_MS);
    // つつくときは 0.56 秒より短くならない。見回すときは 1.0 秒
    expect(Math.min(...range('peck'))).toBeGreaterThanOrEqual(BIRD_JOINT_MOTION.peckMs);
    expect(Math.min(...range('scan'))).toBeGreaterThanOrEqual(BIRD_JOINT_MOTION.scanMs);
  });

  it('rests up to 0.9 s while looking at the finger (FR2.1, FR2.10)', () => {
    const state = restingBird();
    bird.watch!(state, { x: 700, y: 384, at: 0 }, 0);
    Object.assign(state, { mode: 'hop', hopFrom: { x: 512, y: 384 }, hopTo: { x: 512, y: 384 }, hopStart: 0, hopEnd: 150 });
    let landed = -1;
    let hopAgain = -1;
    run(state, 0, 2_000, () => 0.1, (now) => {
      if (landed < 0 && state.mode === 'rest') landed = now;
      if (landed >= 0 && hopAgain < 0 && state.mode === 'hop') hopAgain = now;
    });
    expect(hopAgain).toBeGreaterThan(0);
    expect(hopAgain - landed).toBeGreaterThanOrEqual(BIRD_JOINT_MOTION.lookMs);
    expect(hopAgain - landed).toBeLessThanOrEqual(BIRD_JOINT_MOTION.lookMs + STEP_MS);
  });

  it('takes off at 0.25x and reaches 900 pt/s within about 0.2 s (FR2.3)', () => {
    const state = restingBird();
    bird.react!(state, { x: 450, y: 384 }, tablet, 0, middle);
    const speeds: number[] = [];
    let x = state.x;
    run(state, 0, 400, middle, () => {
      speeds.push((state.x - x) / (STEP_MS / 1000));
      x = state.x;
    });
    const full = BIRD_MOTION.fleeSpeed;
    // 最初のフレームは 0.25 倍に近く、だんだん速くなる
    expect(speeds[0]).toBeLessThan(full * 0.4);
    expect(speeds[0]).toBeGreaterThan(full * 0.25);
    for (let i = 1; i < speeds.length; i += 1) expect(speeds[i]).toBeGreaterThanOrEqual(speeds[i - 1] - 1e-6);
    // 0.2 秒（13 フレーム目）からあとは秒速 900 点
    for (const v of speeds.slice(13)) expect(v).toBeCloseTo(full, 3);
  });

  it('turns back into the field at the edge (FR2.4)', () => {
    const state = restingBird({ x: 50, y: 384 });
    Object.assign(state, { heading: Math.PI, dir: -1, restUntil: 0 });
    run(state, 0, STEP_MS, () => 0.5);
    expect(state.mode).toBe('hop');
    expect(state.hopTo.x).toBeGreaterThan(50);
    expect(state.dir).toBe(1);
  });

  it('comes back from the edge when recalled, and is first in line to appear while away (FR2.5, FR4.5)', () => {
    const state = restingBird();
    Object.assign(state, { mode: 'away', returnAt: 60_000, x: -1000, y: -1000 });
    expect(bird.isOnScreen(state, tablet)).toBe(false);
    expect(bird.recallRank(state, 0)).toEqual({ tier: RECALL_TIER.appear, order: 60_000 });
    bird.recall(state, tablet, 1_000);
    run(state, 1_000, STEP_MS);
    expect(state.mode).toBe('rest');
    expect(state.entering).toBe(true);
    expect(state.act).toBe('idle');
    run(state, 1_016, 2_000);
    expect(bird.isOnScreen(state, tablet)).toBe(true);
    // 歩いている小鳥は呼び戻しの候補にならない
    expect(bird.recallRank(state, 3_000)).toBeNull();
  });

  it('gets the finger position from the world each step and looks at it (the real bird in the world)', () => {
    const w = createWorld({ counts: { bird: 1 }, field: tablet, isTablet: true, now: 0, rand: middle });
    expect(w.agents.map((a) => a.kind)).toEqual(['bird']);
    const state = w.agents[0].state as BirdJointState;
    Object.assign(state, { mode: 'hop', x: 512, y: 384, heading: 0, dir: 1, entering: false });
    Object.assign(state, { hopFrom: { x: 512, y: 384 }, hopTo: { x: 512, y: 384 }, hopStart: 0, hopEnd: 150 });
    // 指が左下（後ろ）に動いた
    pointWorld(w, { x: 300, y: 500 }, 10);
    let now = 0;
    for (let t = 0; t < 600; t += STEP_MS) {
      now += STEP_MS;
      stepWorld(w, tablet, now, () => 0.1);
    }
    expect(state.pointer).toEqual({ x: 300, y: 500, at: 10 });
    expect(state.act).toBe('look');
    expect(state.dir).toBe(-1);
    expect(state.joints.neck).toBeGreaterThan(0.2);
  });
});
