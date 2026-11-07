/**
 * 紐・しっぽ・猫じゃらし・ネズミの動き（FR2.1〜FR2.4）。描画に依存しない計算だけを置く。
 * 動き方・速さ・ネズミの頻度は、ネコの様子を見て調整する値（mockups.md「まだ決めていない点」）。
 *
 * - 紐・しっぽ：画面の端から入り、速さを変えながらクネクネと横切って、反対側から出ていく。
 *   しばらく隠れたあと、別の端からまた入ってくる。
 * - 猫じゃらし：持ち手は画面の下の外。軸の先のふさが「止まる・素早く飛ぶ・小刻みに揺れる」を繰り返す。
 *   触られると下へ引っ込んで消え、しばらくしてまた伸びて出てくる。
 * - ネズミ：ときどき現れ、ゆっくり歩く・止まる・斜めに走る・途中で向きを変える・たまに戻る。
 *
 * v0.1：獲物の世界（src/prey/world.ts）を UI スレッドで進めるため、関数に 'worklet' を付けた。計算と値は変えていない。
 */

export type Vec = { x: number; y: number };
export type ToyKind = 'string' | 'tail' | 'teaser';

export type TeaserPhase = 'pause' | 'dart' | 'wiggle' | 'retract' | 'hidden' | 'extend';

export type TeaserState = {
  /** 持ち手の横の位置（画面の幅に対する割合）。画面が回っても下の端に付いたまま */
  anchorRatio: number;
  phase: TeaserPhase;
  phaseUntil: number;
  /** 揺れるときの中心 */
  center: Vec;
  /** 軸のしなりを決める制御点（ふさの動きに遅れてついてくる） */
  bend: Vec;
  clock: number;
};

/** 紐・しっぽが画面を横切る動き。 */
export type TravelState = {
  /** 画面の中にいるか（false の間は隠れていて、触っても当たらない） */
  visible: boolean;
  /** 隠れているときの、次に入ってくる時刻 */
  enterAt: number;
  /** 向かう先（出ていく端の、さらに外。そこへ着く前に画面から出て隠れる） */
  exit: Vec;
  /** 入ってきたあと、一度でも頭が画面の中に入ったか */
  hasBeenInside: boolean;
  /** 呼び戻されたときは、速めに入ってくる */
  quickEntry: boolean;
  /** いまの速さと、近づけていく先の速さ */
  speed: number;
  speedTarget: number;
  speedChangeAt: number;
  /** クネクネの揺れ */
  wiggleFreq: number;
  wiggleAmp: number;
  clock: number;
};

export type Toy = {
  kind: ToyKind;
  color: string;
  width: number;
  segLen: number;
  /** points[0] が先（猫じゃらしではふさ）、最後が後ろ（猫じゃらしでは持ち手） */
  points: Vec[];
  vel: Vec;
  target: Vec;
  nextTargetAt: number;
  startledUntil: number;
  /** 触られて、その場で止まっている（「捕まえた」）時刻まで。過ぎたら逃げる・引っ込む */
  caughtUntil: number;
  teaser?: TeaserState;
  travel?: TravelState;
};

/** 走る・止まる（画面の中を走り回る間）、出ていく、触られて逃げる */
export type MouseMode = 'run' | 'stop' | 'leave' | 'flee';

export type Mouse = {
  active: boolean;
  x: number;
  y: number;
  /** 顔の向き（描画用） */
  dir: 1 | -1;
  /** 体の向き（描画用、ラジアン）。止まっている間は最後に走っていた向き */
  angle: number;
  vx: number;
  vy: number;
  mode: MouseMode;
  modeUntil: number;
  /** 入ってきた向き（1 = 左の端から右へ） */
  heading: 1 | -1;
  appearedAt: number;
  /** 走り回るのをやめて、出ていく時刻 */
  leaveAt: number;
  /** 一度、体が画面の中に入ったか（入るまでは左右の端で跳ね返らない） */
  hasBeenInside: boolean;
  /** 走った道のり。足の動きに使う */
  stride: number;
  nextAppearAt: number;
  /** 触られて、その場で止まっている時刻まで。過ぎたら逃げる */
  caughtUntil: number;
  /** 大きさ（描く大きさ・当たる範囲・画面の端で出入りする位置にかける倍率） */
  size: number;
};

export type Field = { width: number; height: number };

export const MOTION = {
  startleSpeed: 900,
  startleMs: 320,
  /** 触られたら、逃げる・引っ込む前に、この間だけその場で止まる（ネコが「捕まえた」と感じるように） */
  catchMs: 400,
  steer: 3.5,
  segments: 16,
  margin: 40,

  // 紐・しっぽ
  /** 速さ（秒速、画面の点）。動作確認で「遅い」とのことで一定の 320 にし、iPad でちょうどよいと確かめた（前はゆっくり 30〜80・ふつう 100〜200・速い 240〜380 を混ぜていた） */
  travelSpeed: 320,
  /** 紐だけ、さらに速くする倍率（動作確認の依頼で2倍にし、さらに2倍にして4倍。秒速 1280） */
  stringSpeedFactor: 4,
  travelSpeedChangeMs: [400, 1400] as const,
  /** 画面の外に出てから、また入ってくるまでの時間。速くした分、画面にいる時間が短くなったので短くした（前は 2〜7秒） */
  travelHiddenMs: [1_000, 3_500] as const,
  /** 紐はしっぽの4倍速く、すぐ横切ってしまうので、しっぽより短く待つ（0.3〜1.2秒では「再登場が早過ぎる」とのことで2倍にした） */
  stringHiddenMs: [600, 2_400] as const,
  travelFirstEnterMs: [0, 1_500] as const,
  travelWiggleFreq: [2.5, 5] as const,
  travelWiggleAmp: [0.6, 1.1] as const,
  /** 画面の外の、入ってくる場所・出ていく場所までの距離 */
  offscreen: 80,

  // 猫じゃらし
  teaserDartSpeed: 1100,
  teaserRetractSpeed: 1800,
  teaserExtendSpeed: 900,
  teaserPauseMs: [400, 1500] as const,
  teaserWiggleMs: [500, 1300] as const,
  teaserHiddenMs: [2_500, 6_000] as const,
  teaserWiggleAmp: 16,
  /** 軸が重さで下にたわむ量 */
  teaserSag: 70,
  /** 先のふさの大きさ（軸の太さに対する倍率にかける）。動作確認の依頼で2倍 */
  teaserPuffScale: 2,

  // ネズミ（動作確認の依頼で、入ってきたら画面の中をしばらく走り回り、それから画面の外へ出ていく）
  /** 走る速さ。動作確認で 320 にし、iPad でちょうどよいと確かめた */
  mouseRunSpeed: 320,
  mouseEscapeSpeed: 950,
  /** 走り回る時間。過ぎたら出ていく */
  mouseRoamMs: [8_000, 15_000] as const,
  /** 1回に同じ向きへ走る時間 */
  mouseRunMs: [500, 1_400] as const,
  mouseStopMs: [300, 1_000] as const,
  /** 向きを選び直したときに、止まる確率 */
  mouseStopChance: 0.2,
  /** 足を前後に1往復させる道のり */
  mouseStepLength: 36,
  mouseFirstMs: [6_000, 12_000] as const,
  /** 出ていってから、また入ってくるまでの時間。走り回る時間が短くなったので短くした（前は 15〜35秒） */
  mouseGapMs: [7_000, 17_000] as const,
  /** ネズミの大きさ（タブレット）。動作確認の依頼で2倍 */
  mouseScale: 2,
  /** スマートフォンのネズミの大きさ。iPhone で「大き過ぎる」とのことで、タブレットの 75%（前はタブレットと同じ2倍） */
  phoneMouseScale: 1.5,
  /** スマートフォンの紐・しっぽ・猫じゃらしの大きさ（タブレットに対する倍率）。iPhone で「大き過ぎる」とのことで 1.6 の 75% */
  phoneToyScale: 1.2,

  /**
   * 画面に何も見えない状態がこれだけ続いたら、隠れているものを呼び戻す。
   * 呼び戻してから見えるまでの時間を足しても、何も見えない時間が5秒を超えないようにする
   */
  callBackAfterEmptyMs: 2_000,
};

type Rand = () => number;

const between = (rand: Rand, min: number, max: number) => {
  'worklet';
  return min + (max - min) * rand();
};

function clamp(v: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, v));
}

function randomPoint(field: Field, rand: Rand): Vec {
  'worklet';
  const m = MOTION.margin;
  return { x: between(rand, m, Math.max(m, field.width - m)), y: between(rand, m, Math.max(m, field.height - m)) };
}

type Edge = 0 | 1 | 2 | 3; // 上・右・下・左

/** 画面の端の外の点。 */
function edgePoint(field: Field, edge: Edge, rand: Rand): Vec {
  'worklet';
  const o = MOTION.offscreen;
  switch (edge) {
    case 0:
      return { x: between(rand, 0, field.width), y: -o };
    case 1:
      return { x: field.width + o, y: between(rand, 0, field.height) };
    case 2:
      return { x: between(rand, 0, field.width), y: field.height + o };
    default:
      return { x: -o, y: between(rand, 0, field.height) };
  }
}

/** 画面の中に見えているか。隠れているものは描かず、触っても当たらない。 */
export function isToyVisible(toy: Toy): boolean {
  'worklet';
  if (toy.travel) return toy.travel.visible;
  if (toy.teaser) return toy.teaser.phase !== 'hidden';
  return true;
}

// ---------------------------------------------------------------- 紐・しっぽ

function parkOffscreen(toy: Toy, field: Field): void {
  'worklet';
  const far = { x: -field.width - 1000, y: -field.height - 1000 };
  toy.points.forEach((p) => {
    p.x = far.x;
    p.y = far.y;
  });
}

/** 紐・しっぽの進む速さ。紐はしっぽより速い。 */
export function travelSpeedOf(toy: Toy): number {
  'worklet';
  return toy.kind === 'string' ? MOTION.travelSpeed * MOTION.stringSpeedFactor : MOTION.travelSpeed;
}

function enter(toy: Toy, field: Field, now: number, rand: Rand): void {
  'worklet';
  const t = toy.travel!;
  const from = Math.floor(rand() * 4) as Edge;
  // 出ていくのは、入ってきた端とは別の端（向かい側が多め）
  const opposite = ((from + 2) % 4) as Edge;
  const to = rand() < 0.7 ? opposite : (((from + (rand() < 0.5 ? 1 : 3)) % 4) as Edge);
  const start = edgePoint(field, from, rand);
  toy.points.forEach((p) => {
    p.x = start.x;
    p.y = start.y;
  });
  // 出ていく端の点の、さらに外へ向かわせる（端で止まって回らないように）
  const out = edgePoint(field, to, rand);
  const center = { x: field.width / 2, y: field.height / 2 };
  const ox = out.x - center.x;
  const oy = out.y - center.y;
  const od = Math.hypot(ox, oy) || 1;
  t.exit = { x: out.x + (ox / od) * 2000, y: out.y + (oy / od) * 2000 };
  t.hasBeenInside = false;
  t.visible = true;
  if (t.quickEntry) {
    // 呼び戻されたときは、すぐ画面に入ってくるよう速めに始める
    t.speed = between(rand, 260, 340);
    t.speedTarget = t.speed;
    t.speedChangeAt = now + 800;
    t.quickEntry = false;
  } else {
    t.speed = travelSpeedOf(toy);
    t.speedTarget = t.speed;
    t.speedChangeAt = now;
  }
  t.wiggleFreq = between(rand, ...MOTION.travelWiggleFreq);
  t.wiggleAmp = between(rand, ...MOTION.travelWiggleAmp);
  toy.vel = { x: 0, y: 0 };
}

function followChain(toy: Toy): void {
  'worklet';
  for (let i = 1; i < toy.points.length; i += 1) {
    const prev = toy.points[i - 1];
    const p = toy.points[i];
    const ax = p.x - prev.x;
    const ay = p.y - prev.y;
    const d = Math.hypot(ax, ay) || 1;
    if (d > toy.segLen) {
      p.x = prev.x + (ax / d) * toy.segLen;
      p.y = prev.y + (ay / d) * toy.segLen;
    }
  }
}

function isOutside(p: Vec, field: Field, pad: number): boolean {
  'worklet';
  return p.x < -pad || p.x > field.width + pad || p.y < -pad || p.y > field.height + pad;
}

function stepTraveler(toy: Toy, field: Field, now: number, dt: number, rand: Rand): boolean {
  'worklet';
  const t = toy.travel!;
  if (!t.visible) {
    if (now < t.enterAt) return false;
    enter(toy, field, now, rand);
    return false;
  }

  // 速さは、ときどき選び直した値へなめらかに近づける。いまは一定の速さ（travelSpeedOf）
  if (now >= t.speedChangeAt) {
    t.speedTarget = travelSpeedOf(toy);
    t.speedChangeAt = now + between(rand, ...MOTION.travelSpeedChangeMs);
  }
  t.speed += (t.speedTarget - t.speed) * Math.min(1, 2.5 * dt);
  t.clock += dt;

  const head = toy.points[0];
  const startled = now < toy.startledUntil;
  if (startled) {
    // 触られた直後は、逃げる向きに素早く進む（FR2.3）
    head.x += toy.vel.x * dt;
    head.y += toy.vel.y * dt;
  } else {
    // 入ってくるときは画面の中心へ、一度入ったら出ていく先へ向かう。
    // 向きを左右に振ってクネクネ進む（細長い画面でも、外を素通りしないように）
    const goal = t.hasBeenInside ? t.exit : { x: field.width / 2, y: field.height / 2 };
    const dx = goal.x - head.x;
    const dy = goal.y - head.y;
    const base = Math.atan2(dy, dx);
    const angle = base + Math.sin(t.clock * t.wiggleFreq) * t.wiggleAmp;
    const want = { x: Math.cos(angle) * t.speed, y: Math.sin(angle) * t.speed };
    // 速いものほど向きを素早く合わせる（クネクネしても、決めた速さで進むように）
    const k = Math.min(1, MOTION.steer * Math.max(1, t.speed / MOTION.travelSpeed) * dt);
    toy.vel.x += (want.x - toy.vel.x) * k;
    toy.vel.y += (want.y - toy.vel.y) * k;
    head.x += toy.vel.x * dt;
    head.y += toy.vel.y * dt;
  }
  followChain(toy);

  // 全身が画面の外に出たら隠れて、しばらくしたらまた入ってくる。
  // 入ってきた直後（まだ全身が外）は隠さない
  if (!isOutside(head, field, 0)) t.hasBeenInside = true;
  const pad = MOTION.offscreen * 0.5;
  if (t.hasBeenInside && !startled && toy.points.every((p) => isOutside(p, field, pad))) {
    t.visible = false;
    const [min, max] = toy.kind === 'string' ? MOTION.stringHiddenMs : MOTION.travelHiddenMs;
    t.enterAt = now + between(rand, min, max);
    parkOffscreen(toy, field);
  }
  return false;
}

// ---------------------------------------------------------------- 猫じゃらし

/** 持ち手の位置（画面の下の端の少し外）。 */
export function teaserAnchor(toy: Toy, field: Field): Vec {
  'worklet';
  return { x: (toy.teaser?.anchorRatio ?? 0.5) * field.width, y: field.height + 30 };
}

/** ふさ（points[0]）から持ち手まで、たわんだ軸に沿って点を並べ直す。 */
function layTeaser(toy: Toy, field: Field): void {
  'worklet';
  const t = toy.teaser;
  if (!t) return;
  const tip = toy.points[0];
  const anchor = teaserAnchor(toy, field);
  const n = toy.points.length;
  for (let i = 1; i < n; i += 1) {
    const s = i / (n - 1);
    const a = (1 - s) * (1 - s);
    const b = 2 * (1 - s) * s;
    const c = s * s;
    toy.points[i] = { x: a * tip.x + b * t.bend.x + c * anchor.x, y: a * tip.y + b * t.bend.y + c * anchor.y };
  }
}

function moveToward(p: Vec, to: Vec, maxStep: number): boolean {
  'worklet';
  const dx = to.x - p.x;
  const dy = to.y - p.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxStep) {
    p.x = to.x;
    p.y = to.y;
    return true;
  }
  p.x += (dx / dist) * maxStep;
  p.y += (dy / dist) * maxStep;
  return false;
}

/** 猫じゃらしを dt 秒進める。飛び始めた・出てきたら true（動いた音の合図）。 */
function stepTeaser(toy: Toy, field: Field, now: number, dt: number, rand: Rand): boolean {
  'worklet';
  const t = toy.teaser!;
  const tip = toy.points[0];
  const anchor = teaserAnchor(toy, field);
  let cue = false;
  t.clock += dt;

  if (t.phase === 'retract') {
    // 持ち手の方へ素早く引っ込む。軸も短くなって画面の下へ消える
    if (moveToward(tip, anchor, MOTION.teaserRetractSpeed * dt)) {
      t.phase = 'hidden';
      t.phaseUntil = now + between(rand, ...MOTION.teaserHiddenMs);
    }
  } else if (t.phase === 'hidden') {
    tip.x = anchor.x;
    tip.y = anchor.y;
    if (now >= t.phaseUntil) {
      // 別の場所から伸びて出てくる
      t.anchorRatio = between(rand, 0.2, 0.8);
      const a = teaserAnchor(toy, field);
      tip.x = a.x;
      tip.y = a.y;
      t.bend = { ...a };
      toy.target = randomPoint(field, rand);
      t.phase = 'extend';
    }
  } else if (t.phase === 'extend') {
    if (moveToward(tip, toy.target, MOTION.teaserExtendSpeed * dt)) {
      t.phase = 'pause';
      t.phaseUntil = now + between(rand, ...MOTION.teaserPauseMs);
    }
  } else {
    if (now >= t.phaseUntil) {
      const r = rand();
      if (t.phase !== 'pause' && r < 0.45) {
        t.phase = 'pause';
        t.phaseUntil = now + between(rand, ...MOTION.teaserPauseMs);
      } else if (r < 0.7) {
        t.phase = 'wiggle';
        t.phaseUntil = now + between(rand, ...MOTION.teaserWiggleMs);
        t.center = { ...tip };
      } else {
        t.phase = 'dart';
        toy.target = randomPoint(field, rand);
        t.phaseUntil = now + 1200;
        cue = true;
      }
    }
    if (t.phase === 'dart') {
      // 着いたら、すぐ次の動きへ（止まる・揺れるのどちらか）
      if (moveToward(tip, toy.target, MOTION.teaserDartSpeed * dt)) t.phaseUntil = now;
    } else if (t.phase === 'wiggle') {
      tip.x = t.center.x + Math.sin(t.clock * 21) * MOTION.teaserWiggleAmp;
      tip.y = t.center.y + Math.sin(t.clock * 13 + 1) * MOTION.teaserWiggleAmp * 0.6;
    } else {
      // 止まっている間も、ほんの少しだけ動く
      tip.x += Math.sin(t.clock * 3.1) * 6 * dt;
      tip.y += Math.cos(t.clock * 2.3) * 6 * dt;
    }
    tip.x = clamp(tip.x, MOTION.margin, Math.max(MOTION.margin, field.width - MOTION.margin));
    tip.y = clamp(tip.y, MOTION.margin, Math.max(MOTION.margin, field.height - MOTION.margin));
  }

  // 軸のしなり：真ん中より少し下にたわみ、ふさの動きに遅れてついてくる。
  // 短いときほどたわみは小さい
  const length = Math.hypot(tip.x - anchor.x, tip.y - anchor.y);
  const sag = MOTION.teaserSag * Math.min(1, length / 400);
  const want = { x: (tip.x + anchor.x) / 2, y: (tip.y + anchor.y) / 2 + sag };
  const k = Math.min(1, 5 * dt);
  t.bend.x += (want.x - t.bend.x) * k;
  t.bend.y += (want.y - t.bend.y) * k;
  layTeaser(toy, field);
  return cue;
}

// ---------------------------------------------------------------- 作る・進める
// （worklet は定義した時点で使う関数を取り込むので、使う関数より後ろに置く）

export function createToys(
  field: Field,
  options: { kinds: ToyKind[]; colors: string[]; isTablet: boolean; now: number },
  rand: Rand = Math.random,
): Toy[] {
  'worklet';
  const scale = options.isTablet ? 1 : MOTION.phoneToyScale; // スマートフォンは少し太く大きく
  return options.kinds.map((kind, i) => {
    const start = randomPoint(field, rand);
    // 紐・しっぽは動作確認の依頼で太さも長さも2倍にした。猫じゃらしの軸はそのまま（先のふさだけ teaserPuffScale で大きくする）
    const baseWidth = kind === 'tail' ? 32 : kind === 'teaser' ? 5 : 12;
    const segLen = (kind === 'tail' ? 18 : 24) * scale;
    const toy: Toy = {
      kind,
      color: options.colors[i % options.colors.length],
      width: baseWidth * scale,
      segLen,
      points: Array.from({ length: MOTION.segments }, (_, k) => ({ x: start.x - k * segLen * 0.5, y: start.y })),
      vel: { x: 0, y: 0 },
      target: randomPoint(field, rand),
      nextTargetAt: 0,
      startledUntil: 0,
      caughtUntil: 0,
    };
    if (kind === 'teaser') {
      toy.teaser = {
        anchorRatio: between(rand, 0.3, 0.7),
        phase: 'pause',
        phaseUntil: options.now + between(rand, ...MOTION.teaserPauseMs),
        center: { ...start },
        bend: { ...start },
        clock: 0,
      };
      layTeaser(toy, field);
    } else {
      toy.travel = {
        visible: false,
        enterAt: options.now + between(rand, ...MOTION.travelFirstEnterMs) + i * 600,
        exit: { ...start },
        hasBeenInside: false,
        quickEntry: false,
        speed: 0,
        speedTarget: 0,
        speedChangeAt: 0,
        wiggleFreq: between(rand, ...MOTION.travelWiggleFreq),
        wiggleAmp: between(rand, ...MOTION.travelWiggleAmp),
        clock: between(rand, 0, 10),
      };
      parkOffscreen(toy, field);
    }
    return toy;
  });
}

/** 1つのものを dt 秒進める。猫じゃらしが素早く飛び始めたら true（動いた音の合図）。画面に入ってきたときの音は PlayField が鳴らす。 */
export function stepToy(toy: Toy, field: Field, now: number, dt: number, rand: Rand = Math.random): boolean {
  'worklet';
  // 捕まえられている間は、その場で止まる
  if (now < toy.caughtUntil) return false;
  if (toy.teaser) return stepTeaser(toy, field, now, dt, rand);
  if (toy.travel) return stepTraveler(toy, field, now, dt, rand);
  return false;
}

// ---------------------------------------------------------------- 共通

/** 点から線（ものの体）までのいちばん近い距離。隠れているものは当たらない。 */
export function distanceToToy(toy: Toy, p: Vec): number {
  'worklet';
  if (!isToyVisible(toy)) return Number.POSITIVE_INFINITY;
  return Math.min(...toy.points.map((q) => Math.hypot(q.x - p.x, q.y - p.y)));
}

export function hitRadius(toy: Toy): number {
  'worklet';
  // 猫じゃらしは、先のふさ（毛の長さ = 太さ × 6 × teaserPuffScale）のどこを触っても当たる
  if (toy.kind === 'teaser') return Math.max(36, toy.width * 6 * MOTION.teaserPuffScale);
  return Math.max(36, toy.width * 2);
}

/**
 * 触られた（FR2.3）。
 * - 猫じゃらし：引っ込んで画面から消え、しばらくしてまた出てくる
 * - 紐・しっぽ：触られた所から離れる向きに、跳ねて素早く逃げる
 */
export function startle(toy: Toy, from: Vec, field: Field, now: number): void {
  'worklet';
  // 止まっている間にまた触られても、止まる時間は延ばさない（押さえ続けて動けなくならないように）
  if (now < toy.caughtUntil) return;
  // まず一瞬その場で止まり（捕まえた）、それから逃げる・引っ込む
  toy.caughtUntil = now + MOTION.catchMs;
  const releaseAt = toy.caughtUntil;
  if (toy.teaser) {
    if (toy.teaser.phase !== 'retract' && toy.teaser.phase !== 'hidden') toy.teaser.phase = 'retract';
    toy.startledUntil = releaseAt + MOTION.startleMs;
    return;
  }
  const head = toy.points[0];
  const ax = head.x - from.x;
  const ay = head.y - from.y;
  const d = Math.hypot(ax, ay) || 1;
  const away = { x: ax / d, y: ay / d };
  toy.vel = { x: away.x * MOTION.startleSpeed, y: away.y * MOTION.startleSpeed };
  toy.target = {
    x: clamp(head.x + away.x * 320, MOTION.margin, Math.max(MOTION.margin, field.width - MOTION.margin)),
    y: clamp(head.y + away.y * 320, MOTION.margin, Math.max(MOTION.margin, field.height - MOTION.margin)),
  };
  toy.startledUntil = releaseAt + MOTION.startleMs;
  toy.nextTargetAt = releaseAt + MOTION.startleMs + 600;
}

// ---------------------------------------------------------------- ネズミ

export function createMouse(now: number, rand: Rand = Math.random, size: number = MOTION.mouseScale): Mouse {
  'worklet';
  return {
    active: false,
    x: 0,
    y: 0,
    dir: 1,
    angle: 0,
    vx: 0,
    vy: 0,
    mode: 'run',
    modeUntil: 0,
    heading: 1,
    appearedAt: 0,
    leaveAt: 0,
    hasBeenInside: false,
    stride: 0,
    nextAppearAt: now + between(rand, ...MOTION.mouseFirstMs),
    caughtUntil: 0,
    size,
  };
}

/** ネズミの体が画面の中に収まる範囲（上下左右の余白）。 */
function mouseBounds(field: Field, size: number) {
  'worklet';
  const m = MOTION.margin * size;
  return { left: m, right: Math.max(m, field.width - m), top: m, bottom: Math.max(m, field.height - m) };
}

function setMouseVelocity(mouse: Mouse, speed: number, angle: number): void {
  'worklet';
  mouse.vx = Math.cos(angle) * speed;
  mouse.vy = Math.sin(angle) * speed;
  mouse.angle = angle;
  if (mouse.vx !== 0) mouse.dir = mouse.vx > 0 ? 1 : -1;
}

/** 画面の中の好きな場所へ向かって走る（走り回る）。ときどき止まる。 */
function chooseMouseMode(mouse: Mouse, field: Field, now: number, rand: Rand): void {
  'worklet';
  if (mouse.hasBeenInside && rand() < MOTION.mouseStopChance) {
    mouse.mode = 'stop';
    mouse.modeUntil = now + between(rand, ...MOTION.mouseStopMs);
    mouse.vx = 0;
    mouse.vy = 0;
    return;
  }
  const b = mouseBounds(field, mouse.size);
  const to = { x: between(rand, b.left, b.right), y: between(rand, b.top, b.bottom) };
  mouse.mode = 'run';
  mouse.modeUntil = now + between(rand, ...MOTION.mouseRunMs);
  setMouseVelocity(mouse, MOTION.mouseRunSpeed, Math.atan2(to.y - mouse.y, to.x - mouse.x));
}

/** 走り回るのをやめて、近い方の左右の端から出ていく。 */
function startLeaving(mouse: Mouse, field: Field, rand: Rand): void {
  'worklet';
  mouse.mode = 'leave';
  mouse.modeUntil = Number.POSITIVE_INFINITY;
  const base = mouse.x < field.width / 2 ? Math.PI : 0;
  setMouseVelocity(mouse, MOTION.mouseRunSpeed, base + between(rand, -0.4, 0.4));
}

/** ネズミを進める。現れたら 'appeared' を返す（音の合図）。 */
export function stepMouse(mouse: Mouse, field: Field, now: number, dt: number, rand: Rand = Math.random): 'appeared' | null {
  'worklet';
  // 捕まえられている間は、その場で止まる（足も動かない）
  if (mouse.active && now < mouse.caughtUntil) return null;
  if (!mouse.active) {
    if (now < mouse.nextAppearAt) return null;
    mouse.active = true;
    mouse.heading = rand() < 0.5 ? 1 : -1;
    const edge = 40 * mouse.size;
    const b = mouseBounds(field, mouse.size);
    mouse.x = mouse.heading === 1 ? -edge : field.width + edge;
    mouse.y = between(rand, b.top, b.bottom);
    mouse.appearedAt = now;
    mouse.leaveAt = now + between(rand, ...MOTION.mouseRoamMs);
    mouse.hasBeenInside = false;
    chooseMouseMode(mouse, field, now, rand);
    return 'appeared';
  }

  const roaming = mouse.mode === 'run' || mouse.mode === 'stop';
  if (roaming && now >= mouse.leaveAt) startLeaving(mouse, field, rand);
  else if (roaming && now >= mouse.modeUntil) chooseMouseMode(mouse, field, now, rand);

  mouse.x += mouse.vx * dt;
  mouse.y += mouse.vy * dt;
  mouse.stride += Math.hypot(mouse.vx, mouse.vy) * dt;

  const b = mouseBounds(field, mouse.size);
  if (mouse.x >= b.left && mouse.x <= b.right) mouse.hasBeenInside = true;

  // 上下の端では跳ね返る（画面の上下からは出ていかない）
  if (mouse.y < b.top) {
    mouse.y = b.top;
    mouse.vy = Math.abs(mouse.vy);
  } else if (mouse.y > b.bottom) {
    mouse.y = b.bottom;
    mouse.vy = -Math.abs(mouse.vy);
  }
  // 走り回っている間は、左右の端でも跳ね返る（画面の中にいる）
  if (mouse.mode === 'run' && mouse.hasBeenInside) {
    if (mouse.x < b.left) {
      mouse.x = b.left;
      mouse.vx = Math.abs(mouse.vx);
    } else if (mouse.x > b.right) {
      mouse.x = b.right;
      mouse.vx = -Math.abs(mouse.vx);
    }
  }
  if (mouse.vx !== 0 || mouse.vy !== 0) setMouseVelocity(mouse, Math.hypot(mouse.vx, mouse.vy), Math.atan2(mouse.vy, mouse.vx));

  // 出ていくとき・逃げるときに、左右の端から出たら、いなくなる
  const gone = 60 * mouse.size;
  if (mouse.x < -gone || mouse.x > field.width + gone) {
    mouse.active = false;
    mouse.vx = 0;
    mouse.vy = 0;
    mouse.nextAppearAt = now + between(rand, ...MOTION.mouseGapMs);
  }
  return null;
}

/**
 * 触られたネズミは、一瞬その場で止まり（捕まえた）、それから、いまの向き（止まっていたら顔の向き）へ斜めに全速で逃げていく。
 * 止まっている間は、体の向きを変えない（逃げる向きは、動き出したときに向く）。
 */
export function startleMouse(mouse: Mouse, now: number, rand: Rand = Math.random): void {
  'worklet';
  if (now < mouse.caughtUntil) return;
  const sign: 1 | -1 = mouse.vx > 0 ? 1 : mouse.vx < 0 ? -1 : mouse.dir;
  mouse.mode = 'flee';
  mouse.modeUntil = Number.POSITIVE_INFINITY;
  mouse.caughtUntil = now + MOTION.catchMs;
  const angle = (sign === 1 ? 0 : Math.PI) + between(rand, -0.5, 0.5);
  mouse.vx = Math.cos(angle) * MOTION.mouseEscapeSpeed;
  mouse.vy = Math.sin(angle) * MOTION.mouseEscapeSpeed;
}

// ---------------------------------------------------------------- 画面を空にしない

/** ものの体のどこかが画面の中に見えているか。 */
export function isToyOnScreen(toy: Toy, field: Field): boolean {
  'worklet';
  if (!isToyVisible(toy)) return false;
  return toy.points.some((p) => !isOutside(p, field, 0));
}

export function isMouseOnScreen(mouse: Mouse, field: Field): boolean {
  'worklet';
  const half = 30 * mouse.size;
  return mouse.active && mouse.x > -half && mouse.x < field.width + half;
}

export function isAnythingOnScreen(toys: Toy[], mouse: Mouse, field: Field): boolean {
  'worklet';
  return isMouseOnScreen(mouse, field) || toys.some((toy) => isToyOnScreen(toy, field));
}

/** 画面に何も見えなくなった時刻。見えている間は null。 */
export type EmptyWatch = { emptySince: number | null };

// 呼び戻し方（keepSomethingOnScreen と、何匹でも扱う src/prey/world.ts の両方で使う）

/** 隠れている猫じゃらしを、すぐ伸びて出てくるようにする。 */
export function callBackTeaser(toy: Toy, now: number): void {
  'worklet';
  if (toy.teaser) toy.teaser.phaseUntil = now;
}

/** 隠れている紐・しっぽを、すぐ速めに入ってくるようにする。 */
export function callBackTraveler(toy: Toy, now: number): void {
  'worklet';
  if (!toy.travel) return;
  toy.travel.enterAt = now;
  toy.travel.quickEntry = true;
}

/** いないネズミを、すぐ現れるようにする。 */
export function callBackMouse(mouse: Mouse, now: number): void {
  'worklet';
  mouse.nextAppearAt = now;
}

/** 画面の外を通っている紐・しっぽを、画面の中心へ向け直す。 */
export function turnTravelerToCenter(toy: Toy, field: Field, now: number): void {
  'worklet';
  const t = toy.travel;
  if (!t) return;
  const head = toy.points[0];
  const cx = field.width / 2 - head.x;
  const cy = field.height / 2 - head.y;
  const d = Math.hypot(cx, cy) || 1;
  t.exit = { x: head.x + (cx / d) * 4000, y: head.y + (cy / d) * 4000 };
  t.hasBeenInside = false;
  t.speed = Math.max(t.speed, 260);
  t.speedTarget = t.speed;
  t.speedChangeAt = now + 800;
}

/**
 * 画面に何も見えない状態が callBackAfterEmptyMs 続いたら、隠れているものを1つ呼び戻す。
 * 猫じゃらし（下から伸びてすぐ見える）→ 紐・しっぽ → ネズミ の順に選ぶ。呼び戻したら true。
 */
export function keepSomethingOnScreen(
  toys: Toy[],
  mouse: Mouse,
  field: Field,
  now: number,
  watch: EmptyWatch,
): boolean {
  'worklet';
  if (isAnythingOnScreen(toys, mouse, field)) {
    watch.emptySince = null;
    return false;
  }
  if (watch.emptySince === null) {
    watch.emptySince = now;
    return false;
  }
  if (now - watch.emptySince < MOTION.callBackAfterEmptyMs) return false;

  // 次に呼び戻すまで、また同じだけ待つ
  watch.emptySince = now;

  const teaser = toys.find((toy) => toy.teaser?.phase === 'hidden');
  if (teaser) {
    callBackTeaser(teaser, now);
    return true;
  }
  const hidden = toys
    .filter((toy) => toy.travel && !toy.travel.visible)
    .sort((a, b) => a.travel!.enterAt - b.travel!.enterAt)[0];
  if (hidden) {
    callBackTraveler(hidden, now);
    return true;
  }
  if (!mouse.active) {
    callBackMouse(mouse, now);
    return true;
  }
  // 画面の外を通っている紐・しっぽは、画面の中心へ向け直す
  const offscreen = toys.find((toy) => toy.travel?.visible);
  if (offscreen) {
    turnTravelerToCenter(offscreen, field, now);
    return true;
  }
  return false;
}
