import { BIRD_JOINT_MOTION, type BirdJointState } from '../../src/prey/behaviors/birdJoint';
import { BIRD_SIZE } from '../../src/prey/kinds/bird';
import { birdJointKind } from '../../src/prey/kinds/birdJoint';
import { PREY_KIND_IDS } from '../../src/prey/kinds';
import type { World } from '../../src/prey/types';
import { pointWorld, touchWorld } from '../../src/prey/world';

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

describe('関節のある小鳥（試し）', () => {
  it('is not in the kinds unless EXPO_PUBLIC_BIRD_JOINTS=1', () => {
    expect(PREY_KIND_IDS).toContain('bird');
    expect(PREY_KIND_IDS).not.toContain('birdJoint');
    jest.isolateModules(() => {
      process.env.EXPO_PUBLIC_BIRD_JOINTS = '1';
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const kinds = require('../../src/prey/kinds') as typeof import('../../src/prey/kinds');
      expect(kinds.PREY_KIND_IDS).toContain('birdJoint');
      expect(kinds.PREY_KIND_IDS).not.toContain('bird');
      delete process.env.EXPO_PUBLIC_BIRD_JOINTS;
    });
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

  it('jumps up, puffs out and shrinks when tapped, then flees', () => {
    const state = restingBird();
    bird.startle(state, { x: 512, y: 384 }, tablet, 0, middle);
    expect(state.mode).toBe('caught');
    let high = 0;
    let puff = 1;
    let small = 1;
    let wing = 0;
    const now = run(state, 0, BIRD_JOINT_MOTION.tapMs - 20, middle, () => {
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
    // 指の方を見る部品には、世界を進めるたびに指の位置を知らせる
    const state = restingBird();
    w.agents.push({ id: 0, kind: 'probe', state });
    const watch = jest.fn();
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const kinds = require('../../src/prey/kinds') as typeof import('../../src/prey/kinds');
      kinds.PREY_BEHAVIORS.probe = { ...bird, watch };
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const world = require('../../src/prey/world') as typeof import('../../src/prey/world');
      world.stepWorld(w, tablet, 16, middle);
    });
    expect(watch).toHaveBeenCalledWith(state, { x: 30, y: 40, at: 9 }, 16);
  });
});
