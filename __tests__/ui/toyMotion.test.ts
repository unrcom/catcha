import {
  createMouse,
  createToys,
  distanceToToy,
  hitRadius,
  travelSpeedOf,
  isAnythingOnScreen,
  isToyOnScreen,
  isToyVisible,
  keepSomethingOnScreen,
  MOTION,
  startle,
  startleMouse,
  stepMouse,
  stepToy,
  type Toy,
} from '../../src/ui/toyMotion';

const field = { width: 1024, height: 768 };
const STEP_MS = 16;
const DT = STEP_MS / 1000;

function seeded(seed = 3) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
}

function toysAt(now = 0): Toy[] {
  return createToys(field, { kinds: ['string', 'tail', 'teaser'], colors: ['#3D7BFF', '#F2C230', '#F5F5F5'], isTablet: true, now }, seeded());
}

const inside = (p: { x: number; y: number }) => p.x >= 0 && p.x <= field.width && p.y >= 0 && p.y <= field.height;

/** 紐・しっぽを、頭が画面の中に入るまで進める。 */
function bringIn(toy: Toy, rand: () => number): number {
  let now = 0;
  for (let i = 0; i < 2000 && !(isToyVisible(toy) && inside(toy.points[0])); i += 1) {
    now += STEP_MS;
    stepToy(toy, field, now, DT, rand);
  }
  return now;
}

describe('toy motion (FR2.1〜FR2.4)', () => {
  it('creates three toys on a tablet and two thicker ones on a phone (FR2.1)', () => {
    expect(toysAt()).toHaveLength(3);
    const phone = createToys(field, { kinds: ['string', 'tail'], colors: ['#000'], isTablet: false, now: 0 }, seeded());
    expect(phone).toHaveLength(2);
    expect(phone[0].width).toBeGreaterThan(toysAt()[0].width);
  });

  it('brings a string in from an edge, sends it across at the travel speed with wiggles, out of the screen, and back again (FR2.1)', () => {
    const [toy] = toysAt();
    const rand = seeded(11);
    expect(isToyVisible(toy)).toBe(false);

    let now = 0;
    let entered = 0;
    let left = 0;
    let wasVisible = false;
    const speeds: number[] = [];
    const turns: number[] = [];
    let lastAngle: number | null = null;
    for (let i = 0; i < 6000; i += 1) {
      now += STEP_MS;
      stepToy(toy, field, now, DT, rand);
      const visible = isToyVisible(toy);
      if (visible && !wasVisible) entered += 1;
      if (!visible && wasVisible) left += 1;
      wasVisible = visible;
      if (visible) {
        const speed = Math.hypot(toy.vel.x, toy.vel.y);
        speeds.push(speed);
        if (speed > 5) {
          const angle = Math.atan2(toy.vel.y, toy.vel.x);
          if (lastAngle !== null) turns.push(Math.abs(Math.atan2(Math.sin(angle - lastAngle), Math.cos(angle - lastAngle))));
          lastAngle = angle;
        }
      }
    }
    // 入ってきて、出ていって、また入ってくる
    expect(entered).toBeGreaterThanOrEqual(2);
    expect(left).toBeGreaterThanOrEqual(1);
    // 一定の速さで進む（紐はしっぽより速い。おおむね travelSpeedOf の値）
    const sorted = [...speeds].sort((a, b) => a - b);
    expect(travelSpeedOf(toy)).toBe(MOTION.travelSpeed * MOTION.stringSpeedFactor);
    expect(sorted[Math.floor(sorted.length / 2)]).toBeGreaterThan(travelSpeedOf(toy) * 0.85);
    expect(sorted[Math.floor(sorted.length / 2)]).toBeLessThan(travelSpeedOf(toy) * 1.15);
    // 向きを振りながら進む（クネクネ）
    expect(Math.max(...turns)).toBeGreaterThan(0.01);
  });

  it('brings the strings onto a tall phone screen too, instead of passing by outside it', () => {
    const phone = { width: 412, height: 915 };
    for (const seed of [1, 2, 3, 4, 5]) {
      const toys = createToys(phone, { kinds: ['string', 'tail'], colors: ['#3D7BFF', '#F2C230'], isTablet: false, now: 0 }, seeded(seed));
      const rand = seeded(seed + 100);
      const onScreenFrames = toys.map(() => 0);
      const frames = 60_000 / STEP_MS; // 1分
      for (let i = 1; i <= frames; i += 1) {
        toys.forEach((toy, k) => {
          stepToy(toy, phone, i * STEP_MS, DT, rand);
          if (isToyOnScreen(toy, phone)) onScreenFrames[k] += 1;
        });
      }
      // しっぽは1分のうち少なくとも3割、紐は4分の1は画面に出ている（紐は速く横切るので、外で待つ時間をしっぽより短くしている）
      expect(onScreenFrames[0] / frames).toBeGreaterThan(0.25);
      expect(onScreenFrames[1] / frames).toBeGreaterThan(0.3);
    }
  });

  it('draws the toys and the mouse smaller on a phone than the earlier phone size (75%)', () => {
    const phone = { width: 393, height: 852 };
    const [tabletString] = toysAt();
    const [phoneString] = createToys(phone, { kinds: ['string'], colors: ['#3D7BFF'], isTablet: false, now: 0 }, seeded());
    expect(phoneString.width).toBeCloseTo(tabletString.width * 1.6 * 0.75);
    expect(createMouse(0, seeded(), MOTION.phoneMouseScale).size).toBeCloseTo(MOTION.mouseScale * 0.75);
  });

  it('cannot be touched while it is out of the screen', () => {
    const [toy] = toysAt();
    expect(isToyVisible(toy)).toBe(false);
    expect(distanceToToy(toy, { x: field.width / 2, y: field.height / 2 })).toBe(Number.POSITIVE_INFINITY);
  });

  it('jumps away from the touch, fast, when touched (FR2.3)', () => {
    const [toy] = toysAt();
    const now = bringIn(toy, seeded(5));
    const head = { ...toy.points[0] };
    const touch = { x: head.x - 10, y: head.y };
    expect(distanceToToy(toy, touch)).toBeLessThanOrEqual(hitRadius(toy));

    startle(toy, touch, field, now);
    expect(toy.vel.x).toBeGreaterThan(0); // 触られた所（左）から右へ逃げる
    expect(Math.hypot(toy.vel.x, toy.vel.y)).toBeCloseTo(MOTION.startleSpeed);
    expect(toy.caughtUntil).toBe(now + MOTION.catchMs);
    expect(toy.startledUntil).toBe(now + MOTION.catchMs + MOTION.startleMs);
  });

  it('holds a touched string still for a moment, as if caught, before it jumps away', () => {
    const [toy] = toysAt();
    const rand = seeded(5);
    let now = bringIn(toy, rand);
    const head = { ...toy.points[0] };
    startle(toy, { x: head.x - 10, y: head.y }, field, now);
    while (now + STEP_MS < toy.caughtUntil) {
      now += STEP_MS;
      stepToy(toy, field, now, DT, rand);
      expect(toy.points[0]).toEqual(head);
    }
    now = toy.caughtUntil + STEP_MS;
    stepToy(toy, field, now, DT, rand);
    expect(toy.points[0].x).toBeGreaterThan(head.x); // 止まり終えたら、触られた所から離れる
  });

  it('reacts to two simultaneous touches on two toys independently, and not to an empty spot (FR2.3, FR2.4)', () => {
    const toys = toysAt();
    bringIn(toys[0], seeded(5));
    bringIn(toys[1], seeded(6));
    const touches = [toys[0].points[0], toys[1].points[0]].map((p) => ({ x: p.x + 5, y: p.y + 5 }));
    const hitBy = (p: { x: number; y: number }) => toys.filter((t) => distanceToToy(t, p) <= hitRadius(t));
    expect(hitBy(touches[0])).toContain(toys[0]);
    expect(hitBy(touches[1])).toContain(toys[1]);

    const empty = { x: -500, y: -500 };
    expect(hitBy(empty)).toHaveLength(0);
  });

  it('moves the teaser like a cat teaser: held from below the screen, its tip pausing, darting and wiggling (FR2.1)', () => {
    const teaser = toysAt()[2];
    expect(teaser.kind).toBe('teaser');
    const anchor = teaser.points[teaser.points.length - 1];
    expect(anchor.y).toBeGreaterThan(field.height); // 持ち手は画面の下の外

    const phases = new Set<string>();
    let darts = 0;
    const rand = seeded(7);
    for (let i = 1; i <= 2000; i += 1) {
      if (stepToy(teaser, field, i * STEP_MS, DT, rand)) darts += 1;
      phases.add(teaser.teaser!.phase);
      const tip = teaser.points[0];
      expect(tip.x).toBeGreaterThanOrEqual(MOTION.margin);
      expect(tip.x).toBeLessThanOrEqual(field.width - MOTION.margin);
      expect(tip.y).toBeGreaterThanOrEqual(MOTION.margin);
      expect(tip.y).toBeLessThanOrEqual(field.height - MOTION.margin);
    }
    expect(phases).toEqual(new Set(['pause', 'dart', 'wiggle']));
    expect(darts).toBeGreaterThan(0);
    // 持ち手は動かない
    const end = teaser.points[teaser.points.length - 1];
    expect(end.x).toBeCloseTo(anchor.x);
    expect(end.y).toBeCloseTo(anchor.y);
  });

  it('pulls the teaser back out of the screen when touched, and brings it out again later (FR2.3)', () => {
    const teaser = toysAt()[2];
    const rand = seeded(9);
    const tip = { ...teaser.points[0] };
    startle(teaser, { x: tip.x - 10, y: tip.y }, field, 1000);
    expect(teaser.teaser!.phase).toBe('retract');

    // まず一瞬その場で止まる（捕まえた）
    let now = 1000;
    while (now + STEP_MS < teaser.caughtUntil) {
      now += STEP_MS;
      stepToy(teaser, field, now, DT, rand);
      expect(teaser.points[0]).toEqual(tip);
    }
    for (let i = 0; i < 200 && teaser.teaser!.phase === 'retract'; i += 1) {
      now += STEP_MS;
      stepToy(teaser, field, now, DT, rand);
    }
    // 引っ込んで、ふさも画面の下の外へ消えた
    expect(teaser.teaser!.phase).toBe('hidden');
    expect(teaser.points[0].y).toBeGreaterThan(field.height);
    expect(isToyVisible(teaser)).toBe(false);
    expect(distanceToToy(teaser, tip)).toBe(Number.POSITIVE_INFINITY);

    // しばらくすると、また伸びて出てくる
    for (let i = 0; i < 1000 && teaser.teaser!.phase !== 'pause'; i += 1) {
      now += STEP_MS;
      stepToy(teaser, field, now, DT, rand);
    }
    expect(isToyVisible(teaser)).toBe(true);
    expect(inside(teaser.points[0])).toBe(true);
  });

  it('lets a mouse come in, run around inside the screen for a while, and then leave (FR2.2)', () => {
    const mouse = createMouse(0, seeded());
    expect(mouse.active).toBe(false);
    const rand = seeded(13);
    expect(stepMouse(mouse, field, mouse.nextAppearAt, DT, rand)).toBe('appeared');
    expect(mouse.active).toBe(true);
    const leaveAt = mouse.leaveAt;
    expect(leaveAt - mouse.appearedAt).toBeGreaterThanOrEqual(MOTION.mouseRoamMs[0]);

    const modes = new Set<string>();
    let wentLeft = false;
    let wentRight = false;
    let wentUp = false;
    let wentDown = false;
    let t = mouse.nextAppearAt;
    for (let i = 0; i < 5000 && mouse.active; i += 1) {
      t += STEP_MS;
      stepMouse(mouse, field, t, DT, rand);
      modes.add(mouse.mode);
      if (t < leaveAt && mouse.hasBeenInside) {
        // 走り回っている間は、画面の外へ出ていかない
        expect(mouse.x).toBeGreaterThanOrEqual(0);
        expect(mouse.x).toBeLessThanOrEqual(field.width);
        if (mouse.vx < -100) wentLeft = true;
        if (mouse.vx > 100) wentRight = true;
        if (mouse.vy < -100) wentUp = true;
        if (mouse.vy > 100) wentDown = true;
      }
    }
    expect(modes.has('run') && modes.has('stop') && modes.has('leave')).toBe(true);
    // いろいろな向きへ走り回る
    expect(wentLeft && wentRight && wentUp && wentDown).toBe(true);
    // 走り回ったあとは、画面の外へ出ていく
    expect(mouse.active).toBe(false);
    expect(t).toBeGreaterThan(leaveAt);
    expect(mouse.nextAppearAt).toBeGreaterThan(t);
  });

  it('moves the mouse legs only while it is running', () => {
    const mouse = createMouse(0, seeded());
    const rand = seeded(5);
    let t = mouse.nextAppearAt;
    stepMouse(mouse, field, t, DT, rand);
    let stoppedSteps = 0;
    for (let i = 0; i < 3000 && mouse.active; i += 1) {
      t += STEP_MS;
      const before = mouse.stride;
      const wasStopped = mouse.mode === 'stop' && t < mouse.modeUntil;
      stepMouse(mouse, field, t, DT, rand);
      if (wasStopped && mouse.mode === 'stop') {
        expect(mouse.stride).toBe(before);
        stoppedSteps += 1;
      } else if (mouse.mode === 'run') {
        expect(mouse.stride).toBeGreaterThan(before);
      }
    }
    expect(stoppedSteps).toBeGreaterThan(0);
  });

  it('never leaves the screen empty for more than 5 seconds, even when the cat keeps chasing everything away', () => {
    for (const kinds of [
      ['string', 'tail', 'teaser'],
      ['string', 'tail'],
    ] as const) {
      const toys = createToys(field, { kinds: [...kinds], colors: ['#3D7BFF', '#F2C230', '#111111'], isTablet: true, now: 0 }, seeded(21));
      const mouse = createMouse(0, seeded(22));
      const watch = { emptySince: null as number | null };
      const rand = seeded(23);
      let now = 0;
      let emptyFor = 0;
      let longestEmpty = 0;
      for (let i = 0; i < 20_000; i += 1) {
        now += STEP_MS;
        toys.forEach((toy) => stepToy(toy, field, now, DT, rand));
        stepMouse(mouse, field, now, DT, rand);
        keepSomethingOnScreen(toys, mouse, field, now, watch);

        // ネコが、見えているものに次々触る（だいたい0.3秒に1回）
        if (rand() < 0.05) {
          toys.forEach((toy) => {
            if (isToyOnScreen(toy, field)) {
              const p = toy.points.find((q) => q.x >= 0 && q.x <= field.width && q.y >= 0 && q.y <= field.height)!;
              startle(toy, { x: p.x - 5, y: p.y }, field, now);
            }
          });
          if (mouse.active) startleMouse(mouse, now, rand);
        }

        if (isAnythingOnScreen(toys, mouse, field)) emptyFor = 0;
        else emptyFor += STEP_MS;
        longestEmpty = Math.max(longestEmpty, emptyFor);
      }
      expect(longestEmpty).toBeLessThanOrEqual(5_000);
    }
  });

  it('makes a touched mouse run away at full speed', () => {
    const mouse = createMouse(0, seeded());
    stepMouse(mouse, field, mouse.nextAppearAt, DT, seeded(2));
    startleMouse(mouse, mouse.nextAppearAt, seeded(4));
    expect(mouse.mode).toBe('flee');
    expect(Math.hypot(mouse.vx, mouse.vy)).toBeCloseTo(MOTION.mouseEscapeSpeed);
  });

  it('holds a touched mouse still for a moment, as if caught, then lets it run away', () => {
    const mouse = createMouse(0, seeded());
    const rand = seeded(2);
    let t = mouse.nextAppearAt;
    stepMouse(mouse, field, t, DT, rand);
    for (let i = 0; i < 120; i += 1) stepMouse(mouse, field, (t += STEP_MS), DT, rand);
    startleMouse(mouse, t, rand);
    const caughtAt = { x: mouse.x, y: mouse.y, stride: mouse.stride, angle: mouse.angle };
    // 止まっている間は、位置も足も向きも変わらない
    while (t + STEP_MS < mouse.caughtUntil) {
      t += STEP_MS;
      stepMouse(mouse, field, t, DT, rand);
      expect(mouse.x).toBe(caughtAt.x);
      expect(mouse.y).toBe(caughtAt.y);
      expect(mouse.stride).toBe(caughtAt.stride);
      expect(mouse.angle).toBe(caughtAt.angle);
    }
    // また触っても、止まる時間は延びない
    const until = mouse.caughtUntil;
    startleMouse(mouse, t, rand);
    expect(mouse.caughtUntil).toBe(until);
    // 止まり終えたら、全速で逃げる
    t = until + STEP_MS;
    stepMouse(mouse, field, t, DT, rand);
    expect(Math.hypot(mouse.x - caughtAt.x, mouse.y - caughtAt.y)).toBeGreaterThan(5);
    expect(mouse.mode).toBe('flee');
  });
});
