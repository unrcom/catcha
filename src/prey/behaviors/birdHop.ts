/**
 * 小鳥の動きの部品（FR2.1〜FR2.5・FR2.7）。数（跳ねる長さ・止まる時間・逃げる速さなど）は小鳥の定義
 * （kinds/bird.ts の BIRD_MOTION）に置き、ここでは受け取って使う（FR2.8）。
 * 状態：画面の外にいる（away）・跳ねている（hop）・止まっている（rest）・捕まって止まっている（caught）・逃げている（flee）
 *
 * - 地面をちょこちょこ跳ねて歩く。1 回の跳ねで hopLength 進み、hopMs かけて着地し、restMs の間止まる
 * - 歩いていて画面の端（端から edgeTurn）に着きそうなら、向きを変えて画面の中へ戻る
 * - 指が noticeRadius 以内に触れたら、触れた位置から離れる向きに fleeSpeed で飛んで画面の外へ出る
 *   （当たり範囲の中なら、ほかの獲物と同じく「捕まえた」で止まってから逃げる）
 * - 画面の外へ出たら、returnMs たってから画面の端から歩いて入ってくる
 *
 * UI スレッドで動かすので関数はすべて 'worklet'。worklet は定義した時点で使う関数を取り込むので、使う関数より後ろに置く。
 * 部品のメソッドと同じ名前の関数は使わない（worklet の取り込みで取り違えないように）。
 */
import { MOTION } from '../../ui/toyMotion';
import { RECALL_TIER, type Behavior, type Field, type Rand, type RecallRank, type Vec } from '../types';

/** 小鳥の動きの数（タブレットを基準にした画面の点・ミリ秒）。小鳥の定義に置く（FR2.8） */
export type BirdMotion = {
  /** 1 回の跳ねで進む長さ */
  hopLength: number;
  /** 1 回の跳ねにかかる時間 */
  hopMs: number;
  /** 跳ねたあと止まる時間（毎回この範囲から選ぶ） */
  restMs: readonly [number, number];
  /** 指がこの距離の中に触れたら逃げる */
  noticeRadius: number;
  /** 逃げる速さ（秒速） */
  fleeSpeed: number;
  /** 歩いていて、画面の端からこの距離に着いたら向きを変える */
  edgeTurn: number;
  /** 画面の外へ逃げてから、また入ってくるまでの時間（毎回この範囲から選ぶ） */
  returnMs: readonly [number, number];
  /** 遊び始めてから、最初に入ってくるまでの時間 */
  firstEnterMs: readonly [number, number];
  /** 1 回跳ねるごとに、歩く向きを左右に振る大きさ（ラジアン。この範囲で毎回選ぶ） */
  wander: number;
  /** 体の半分の大きさ（大きさ 1 のとき。画面に見えているかの判定に使う） */
  bodyRadius: number;
  /** 当たる範囲（大きさ 1 のとき） */
  hitRadius: number;
};

export type BirdMode = 'away' | 'hop' | 'rest' | 'caught' | 'flee';

export type BirdState = {
  mode: BirdMode;
  x: number;
  y: number;
  /** 歩く向き（ラジアン） */
  heading: number;
  /** 顔の向き（描画用。1 = 右） */
  dir: 1 | -1;
  /** 跳ねている間の、跳ね始めの位置・着地する位置・跳ね始めた時刻・着地する時刻 */
  hopFrom: Vec;
  hopTo: Vec;
  hopStart: number;
  hopEnd: number;
  restUntil: number;
  /** 画面の外にいる間の、また入ってくる時刻 */
  returnAt: number;
  /** 触られて、その場で止まっている時刻まで。過ぎたら逃げる */
  caughtUntil: number;
  /** 捕まったときに触れられた位置（止まり終わったら、ここから離れる向きに逃げる） */
  caughtFrom: Vec;
  vx: number;
  vy: number;
  /** 端から入ってきて、まだ端の edgeTurn の内側に入っていない（その間は端で向きを変えない） */
  entering: boolean;
  /** 大きさ（描く大きさ・当たる範囲にかける倍率。スマートフォンは小さい。FR2.7） */
  size: number;
};

/** 描くときに使う、1 フレームの小鳥の姿（Skia と Rive の両方で使う）。 */
export type BirdPose = {
  visible: boolean;
  x: number;
  y: number;
  dir: 1 | -1;
  size: number;
  /** 跳ねている高さ（0〜1。跳ねの真ん中で 1） */
  lift: number;
  /** 羽ばたいて逃げている */
  flying: boolean;
};

function between(rand: Rand, range: readonly [number, number]): number {
  'worklet';
  return range[0] + (range[1] - range[0]) * rand();
}

/** 体のどこかが画面の中に見えているか。 */
export function isBirdOnScreen(state: BirdState, field: Field, m: BirdMotion): boolean {
  'worklet';
  if (state.mode === 'away') return false;
  const r = m.bodyRadius * state.size;
  return state.x + r > 0 && state.x - r < field.width && state.y + r > 0 && state.y - r < field.height;
}

/** 体がすっかり画面の外に出たか（逃げ終わった）。 */
function isBirdGone(state: BirdState, field: Field, m: BirdMotion): boolean {
  'worklet';
  const pad = m.bodyRadius * state.size * 2;
  return state.x < -pad || state.x > field.width + pad || state.y < -pad || state.y > field.height + pad;
}

function faceToward(state: BirdState, dx: number): void {
  'worklet';
  if (dx !== 0) state.dir = dx > 0 ? 1 : -1;
}

/** 画面の外にいる状態にして、また入ってくる時刻を決める。 */
function goAway(state: BirdState, returnAt: number): void {
  'worklet';
  state.mode = 'away';
  state.returnAt = returnAt;
  state.vx = 0;
  state.vy = 0;
}

/** 4 つの端のどれかのすぐ外に立ち、画面の中へ向く。次のフレームで跳ね始める。 */
function enterFromEdge(state: BirdState, field: Field, now: number, rand: Rand, m: BirdMotion): void {
  'worklet';
  const edge = Math.min(3, Math.floor(rand() * 4)); // 上・右・下・左
  const out = m.bodyRadius * state.size;
  const turn = m.edgeTurn;
  const along = (length: number) => turn + Math.max(0, length - turn * 2) * rand();
  const tilt = (rand() - 0.5) * 1.2;
  if (edge === 0) {
    state.x = along(field.width);
    state.y = -out;
    state.heading = Math.PI / 2 + tilt;
  } else if (edge === 1) {
    state.x = field.width + out;
    state.y = along(field.height);
    state.heading = Math.PI + tilt;
  } else if (edge === 2) {
    state.x = along(field.width);
    state.y = field.height + out;
    state.heading = -Math.PI / 2 + tilt;
  } else {
    state.x = -out;
    state.y = along(field.height);
    state.heading = tilt;
  }
  faceToward(state, Math.cos(state.heading));
  state.entering = true;
  state.mode = 'rest';
  state.restUntil = now;
  state.vx = 0;
  state.vy = 0;
}

/** 次の 1 回の跳ねを始める。歩いていて端に着きそうなら、向きを変えて画面の中へ戻る（FR2.4）。 */
function beginHop(state: BirdState, field: Field, now: number, rand: Rand, m: BirdMotion): void {
  'worklet';
  if (!state.entering) state.heading += (rand() - 0.5) * 2 * m.wander;
  let dx = Math.cos(state.heading) * m.hopLength;
  let dy = Math.sin(state.heading) * m.hopLength;
  if (!state.entering) {
    const lo = m.edgeTurn;
    const right = field.width - m.edgeTurn;
    const bottom = field.height - m.edgeTurn;
    if ((dx < 0 && state.x + dx < lo) || (dx > 0 && state.x + dx > right)) dx = -dx;
    if ((dy < 0 && state.y + dy < lo) || (dy > 0 && state.y + dy > bottom)) dy = -dy;
    state.heading = Math.atan2(dy, dx);
  }
  faceToward(state, dx);
  state.hopFrom = { x: state.x, y: state.y };
  state.hopTo = { x: state.x + dx, y: state.y + dy };
  state.hopStart = now;
  state.hopEnd = now + m.hopMs;
  state.mode = 'hop';
}

/** 跳ねている途中の位置にする。着地したら止まる時間を選ぶ。 */
function moveAlongHop(state: BirdState, field: Field, now: number, rand: Rand, m: BirdMotion): void {
  'worklet';
  const span = state.hopEnd - state.hopStart;
  const t = span > 0 ? Math.min(1, (now - state.hopStart) / span) : 1;
  state.x = state.hopFrom.x + (state.hopTo.x - state.hopFrom.x) * t;
  state.y = state.hopFrom.y + (state.hopTo.y - state.hopFrom.y) * t;
  if (t < 1) return;
  state.mode = 'rest';
  state.restUntil = now + between(rand, m.restMs);
  const inside =
    state.x >= m.edgeTurn &&
    state.x <= field.width - m.edgeTurn &&
    state.y >= m.edgeTurn &&
    state.y <= field.height - m.edgeTurn;
  if (inside) state.entering = false;
}

/** from から離れる向きに、fleeSpeed で飛び始める（FR2.3）。 */
function fleeFrom(state: BirdState, from: Vec, m: BirdMotion): void {
  'worklet';
  let ax = state.x - from.x;
  let ay = state.y - from.y;
  let d = Math.hypot(ax, ay);
  if (d < 1e-6) {
    // ちょうど真上に触れたときは、歩いていた向きへ逃げる
    ax = Math.cos(state.heading);
    ay = Math.sin(state.heading);
    d = 1;
  }
  state.vx = (ax / d) * m.fleeSpeed;
  state.vy = (ay / d) * m.fleeSpeed;
  state.heading = Math.atan2(ay, ax);
  faceToward(state, state.vx);
  state.mode = 'flee';
}

/** 1 フレームの小鳥の姿。 */
export function birdPose(state: BirdState, now: number): BirdPose {
  'worklet';
  let lift = 0;
  if (state.mode === 'hop') {
    const span = state.hopEnd - state.hopStart;
    const t = span > 0 ? Math.min(1, Math.max(0, (now - state.hopStart) / span)) : 1;
    lift = Math.sin(Math.PI * t);
  }
  return {
    visible: state.mode !== 'away',
    x: state.x,
    y: state.y,
    dir: state.dir,
    size: state.size,
    lift,
    flying: state.mode === 'flee',
  };
}

export function birdHopBehavior(m: BirdMotion): Behavior<BirdState> {
  return {
    create(ctx) {
      'worklet';
      return {
        mode: 'away',
        x: -1000,
        y: -1000,
        heading: 0,
        dir: 1,
        hopFrom: { x: 0, y: 0 },
        hopTo: { x: 0, y: 0 },
        hopStart: 0,
        hopEnd: 0,
        restUntil: 0,
        returnAt: ctx.now + between(ctx.rand, m.firstEnterMs),
        caughtUntil: 0,
        caughtFrom: { x: 0, y: 0 },
        vx: 0,
        vy: 0,
        entering: true,
        size: ctx.scale,
      };
    },
    step(state, field, now, dt, rand) {
      'worklet';
      switch (state.mode) {
        case 'away':
          if (now >= state.returnAt) enterFromEdge(state, field, now, rand, m);
          return null;
        case 'caught':
          // 捕まえられている間は、その場で止まる。過ぎたら羽ばたいて逃げる
          if (now < state.caughtUntil) return null;
          fleeFrom(state, state.caughtFrom, m);
          return 'flap';
        case 'flee':
          state.x += state.vx * dt;
          state.y += state.vy * dt;
          if (isBirdGone(state, field, m)) goAway(state, now + between(rand, m.returnMs));
          return null;
        case 'hop':
          moveAlongHop(state, field, now, rand, m);
          return null;
        default:
          if (now < state.restUntil) return null;
          beginHop(state, field, now, rand, m);
          // 跳ねる音は、画面に見えているときだけ
          return isBirdOnScreen(state, field, m) ? 'hop' : null;
      }
    },
    startle(state, from, _field, now) {
      'worklet';
      // 止まっている間にまた触られても、止まる時間は延ばさない。逃げているものは止めない
      if (state.mode === 'away' || state.mode === 'caught' || state.mode === 'flee') return null;
      state.mode = 'caught';
      state.caughtUntil = now + MOTION.catchMs;
      state.caughtFrom = { x: from.x, y: from.y };
      return null;
    },
    react(state, from) {
      'worklet';
      // 歩いている小鳥だけが、近くの指に気づいて逃げる（FR2.2）
      if (state.mode !== 'hop' && state.mode !== 'rest') return null;
      if (Math.hypot(state.x - from.x, state.y - from.y) > m.noticeRadius) return null;
      fleeFrom(state, from, m);
      return 'flap';
    },
    isOnScreen(state, field) {
      'worklet';
      return isBirdOnScreen(state, field, m);
    },
    isVisible(state) {
      'worklet';
      return state.mode !== 'away';
    },
    distanceTo(state, p) {
      'worklet';
      if (state.mode === 'away') return Number.POSITIVE_INFINITY;
      return Math.hypot(state.x - p.x, state.y - p.y);
    },
    hitRadius(state) {
      'worklet';
      return m.hitRadius * state.size;
    },
    recallRank(state): RecallRank | null {
      'worklet';
      return state.mode === 'away' ? { tier: RECALL_TIER.appear, order: state.returnAt } : null;
    },
    recall(state, _field, now) {
      'worklet';
      // 次のフレームで端から入ってくる
      state.returnAt = now;
    },
  };
}
