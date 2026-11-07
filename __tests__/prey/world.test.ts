import type { BirdState } from '../../src/prey/behaviors/birdHop';
import type { MouseAgentState } from '../../src/prey/behaviors/mouse';
import type { ToyAgentState } from '../../src/prey/behaviors/strand';
import { PREY_BEHAVIORS, PREY_COLORS, PREY_KIND_IDS } from '../../src/prey/kinds';
import type { Agent, World } from '../../src/prey/types';
import { createWorld, isAnythingOnScreen, stepWorld, touchWorld } from '../../src/prey/world';
import { MOTION, travelSpeedOf } from '../../src/ui/toyMotion';
import { evenly } from '../helpers/preyCounts';

const tablet = { width: 1024, height: 768 };
const phone = { width: 390, height: 844 };
const STEP_MS = 16;

function seeded(seed = 7) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
}

const ofKind = (world: World, kind: string) => world.agents.filter((a) => a.kind === kind);
const toyOf = (a: Agent) => (a.state as ToyAgentState).toy;
const mouseOf = (a: Agent) => (a.state as MouseAgentState).mouse;

/** now から ms だけ進める。毎フレーム check を呼ぶ。 */
function run(world: World, field: typeof tablet, from: number, ms: number, rand: () => number, check?: (now: number) => void): number {
  let now = from;
  for (let t = 0; t < ms; t += STEP_MS) {
    now += STEP_MS;
    stepWorld(world, field, now, rand);
    check?.(now);
  }
  return now;
}

/** 全部の獲物を、しばらく出てこないように隠す（5 種類すべて。知らない種類があればテストを落とす）。 */
function hideEverything(world: World, now: number) {
  for (const a of world.agents) {
    if (a.kind === 'bird') {
      const b = a.state as BirdState;
      b.mode = 'away';
      b.returnAt = now + 1e9;
    } else if (a.kind === 'mouse') {
      const m = mouseOf(a);
      m.active = false;
      m.nextAppearAt = now + 1e9;
    } else if (a.kind === 'teaser') {
      const t = toyOf(a).teaser!;
      t.phase = 'hidden';
      t.phaseUntil = now + 1e9;
    } else if (a.kind === 'string' || a.kind === 'tail') {
      const toy = toyOf(a);
      toy.travel!.visible = false;
      toy.travel!.enterAt = now + 1e9;
    } else {
      throw new Error(`hideEverything does not know how to hide "${a.kind}"`);
    }
  }
}

describe('獲物の世界 (FR1.1〜FR1.3, FR4.2〜FR4.5)', () => {
  it('creates the current four kinds with the current MOTION values, on a tablet and on a phone (FR1.2, FR1.3)', () => {
    const w = createWorld({ counts: evenly(5), field: tablet, isTablet: true, now: 0, rand: seeded() });
    expect(new Set(w.agents.map((a) => a.kind))).toEqual(new Set(PREY_KIND_IDS));
    const string = toyOf(ofKind(w, 'string')[0]);
    const tail = toyOf(ofKind(w, 'tail')[0]);
    const teaser = toyOf(ofKind(w, 'teaser')[0]);
    expect([string.width, string.segLen, travelSpeedOf(string)]).toEqual([12, 24, MOTION.travelSpeed * MOTION.stringSpeedFactor]);
    expect([tail.width, tail.segLen, travelSpeedOf(tail)]).toEqual([32, 18, MOTION.travelSpeed]);
    expect(teaser.width).toBe(5);
    expect(mouseOf(ofKind(w, 'mouse')[0]).size).toBe(MOTION.mouseScale);

    const p = createWorld({ counts: evenly(5), field: phone, isTablet: false, now: 0, rand: seeded() });
    expect(toyOf(ofKind(p, 'string')[0]).width).toBeCloseTo(12 * MOTION.phoneToyScale);
    expect(toyOf(ofKind(p, 'tail')[0]).segLen).toBeCloseTo(18 * MOTION.phoneToyScale);
    expect(mouseOf(ofKind(p, 'mouse')[0]).size).toBe(MOTION.phoneMouseScale);
  });

  it.each([30, 50])('moves a world of %i prey, each with its own kind of behavior (FR1.1)', (count) => {
    const rand = seeded(count);
    const w = createWorld({ counts: evenly(count), field: tablet, isTablet: true, now: 0, rand });
    expect(w.agents).toHaveLength(count);
    const before = w.agents.map((a) => JSON.stringify(a.state));
    run(w, tablet, 0, 3_000, rand);
    // 紐・しっぽ・猫じゃらしは自分の点を、ネズミは自分の位置を動かしている（別々の状態を持つ）
    const moved = w.agents.filter((a, i) => JSON.stringify(a.state) !== before[i]);
    expect(moved.length).toBeGreaterThan(count / 2);
    expect(ofKind(w, 'teaser').every((a) => toyOf(a).teaser !== undefined)).toBe(true);
    expect(ofKind(w, 'mouse').every((a) => typeof mouseOf(a).stride === 'number')).toBe(true);
  });

  it('stops a touched prey for 0.4 s, adds one ripple and reports a hit for the catch sound (FR4.2, FR4.3, FR4.4)', () => {
    const rand = () => 0.5;
    const w = createWorld({ counts: evenly(5), field: tablet, isTablet: true, now: 0, rand });
    const teaserAgent = ofKind(w, 'teaser')[0];
    const teaser = toyOf(teaserAgent);
    const tip = { ...teaser.points[0] };

    const result = touchWorld(w, tip, tablet, 1_000, rand);
    expect(result.hit).toBe(true);
    expect(teaser.caughtUntil).toBe(1_000 + MOTION.catchMs);
    expect(w.ripples).toEqual([{ x: tip.x, y: tip.y, start: 1_000, color: PREY_COLORS.teaser }]);

    // 0.4 秒の間はその場で止まり、過ぎたら引っ込み始める
    w.lastNow = 1_000;
    let now = run(w, tablet, 1_000, 384, rand);
    expect(teaser.points[0]).toEqual(tip);
    now = run(w, tablet, now, 200, rand);
    expect(teaser.teaser!.phase).toBe('retract');
    expect(teaser.points[0]).not.toEqual(tip);

    // 波紋は広がり終わったら消える
    run(w, tablet, now, 1_200, rand);
    expect(w.ripples).toHaveLength(0);
  });

  it('does nothing when the touch is where no prey is (FR4.2)', () => {
    const rand = () => 0.5;
    const w = createWorld({ counts: evenly(5), field: tablet, isTablet: true, now: 0, rand });
    const before = JSON.stringify(w.agents);
    const result = touchWorld(w, { x: 5, y: 5 }, tablet, 1_000, rand);
    expect(result).toEqual({ hit: false, cues: [] });
    expect(w.ripples).toHaveLength(0);
    expect(JSON.stringify(w.agents)).toBe(before);
  });

  it('does not lengthen the stop when a caught prey is touched again', () => {
    const rand = () => 0.5;
    const w = createWorld({ counts: evenly(5), field: tablet, isTablet: true, now: 0, rand });
    const teaser = toyOf(ofKind(w, 'teaser')[0]);
    const tip = { ...teaser.points[0] };
    touchWorld(w, tip, tablet, 1_000, rand);
    touchWorld(w, tip, tablet, 1_200, rand);
    expect(teaser.caughtUntil).toBe(1_000 + MOTION.catchMs);
    expect(w.ripples).toHaveLength(2);
  });

  it.each([
    [5, tablet, true],
    [30, tablet, true],
    [30, phone, false],
  ] as const)('calls a hidden prey back within 5 s when all %i prey are hidden (FR4.5)', (count, field, isTablet) => {
    const rand = seeded(count);
    const w = createWorld({ counts: evenly(count), field, isTablet, now: 0, rand });
    const start = run(w, field, 0, 1_000, rand);
    hideEverything(w, start);
    // 隠したあとのフレームで、画面にはもう何も見えていない
    let now = run(w, field, start, 600, rand);
    expect(isAnythingOnScreen(w, field)).toBe(false);
    let seenAt: number | null = null;
    now = run(w, field, now, 6_000, rand, (t) => {
      if (seenAt === null && isAnythingOnScreen(w, field)) seenAt = t;
    });
    expect(seenAt).not.toBeNull();
    expect(seenAt! - start).toBeLessThanOrEqual(5_000);
  });

  it.each([5, 50])('never leaves the screen empty for more than 5 s while %i prey play for a minute (FR4.5)', (count) => {
    const rand = seeded(count + 1);
    const w = createWorld({ counts: evenly(count), field: tablet, isTablet: true, now: 0, rand });
    let emptySince: number | null = 0;
    let longest = 0;
    run(w, tablet, 0, 60_000, rand, (now) => {
      if (isAnythingOnScreen(w, tablet)) {
        if (emptySince !== null) longest = Math.max(longest, now - emptySince);
        emptySince = null;
      } else if (emptySince === null) {
        emptySince = now;
      }
    });
    expect(longest).toBeLessThanOrEqual(5_000);
  });

  it('uses the behavior of each kind from the kind list', () => {
    expect(Object.keys(PREY_BEHAVIORS)).toEqual([...PREY_KIND_IDS]);
  });
});
