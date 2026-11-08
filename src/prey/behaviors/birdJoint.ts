/**
 * 関節のある小鳥の動きの部品（範囲の変更、2026-11-07 から v0.1 の小鳥）。
 * 歩く・逃げる・戻る（位置の動き）は、今の小鳥の部品（birdHop.ts）をそのまま中で使い、
 * その上で、関節の角度（首・頭の向き・羽の付け根・足・しっぽ・体の傾きとふくらみ）を毎フレーム決める。
 *
 * 3 つの動き（ネコが見て分かるように大きく動かす）：
 * - 普段：跳ねる。止まるたびに「地面をつつく」「きょろきょろ見回す」「指（敵）の方を見る」のどれかをする
 * - タップされた：ぴょんと跳び上がり、体と羽をふくらませてから縮む（捕まって止まっている間）
 * - 逃げる：体を前に傾け、羽を大きく速く羽ばたき、浮き上がりながら飛んでいく
 *
 * 視線：いちばん新しい指の位置（world.pointer。watch で受け取る）に頭と目を向ける。指が後ろなら振り向く。
 *
 * UI スレッドで動かすので関数はすべて 'worklet'。worklet は定義した時点で使う関数を取り込むので、使う関数より後ろに置く。
 * 部品のメソッドと同じ名前の関数は使わない（worklet の取り込みで取り違えないように）。
 */
import type { Behavior, Pointer, Rand, Vec } from '../types';
import { birdHopBehavior, type BirdMotion, type BirdState } from './birdHop';

/** 止まっている間にすること */
export type BirdAct = 'idle' | 'peck' | 'scan' | 'look';

/** 関節の角度など（描き方はこれだけを見て描く）。角度はラジアン、長さは大きさ 1 のときの点 */
export type BirdJoints = {
  /** 地面から浮いている高さ */
  lift: number;
  /** 体を前に傾ける角度（足の付け根のまわり。+ で頭が下がる） */
  lean: number;
  /** 体と頭のふくらみ（横・縦。1 がふつう） */
  puffX: number;
  puffY: number;
  /** 首の角度（+ で頭が下がる） */
  neck: number;
  /** 頭の向き（1 = 体と同じ向き、-1 = 後ろを向く。間の値は振り向く途中） */
  headTurn: number;
  /** 羽の付け根の角度（+ で羽の先が上がる） */
  wing: number;
  /** 羽の広がり（1 = たたむ。大きいほど長く広げる） */
  wingSpread: number;
  /** しっぽの角度（+ で上がる） */
  tail: number;
  /** 足の角度（+ で足先が後ろへ）と長さの割合（1 = 伸ばす、小さいほどたたむ） */
  legFront: number;
  legBack: number;
  legLength: number;
  /** 黒目のずれ（頭の中の向き。-1〜1） */
  eyeX: number;
  eyeY: number;
  /** 目を閉じている */
  blink: boolean;
};

export type BirdJointState = BirdState & {
  act: BirdAct;
  actStart: number;
  actEnd: number;
  /** 見る先（look のとき） */
  gaze: Vec | null;
  /** タップされた時刻・逃げ始めた時刻 */
  tapStart: number;
  fleeStart: number;
  /** 次にまばたきする時刻 */
  blinkAt: number;
  pointer: Pointer | null;
  joints: BirdJoints;
};

/** 関節の動きの数（大きさ 1 のときの点・ミリ秒）。 */
export const BIRD_JOINT_MOTION = {
  /** タップされたときに跳び上がる高さ */
  tapJump: 34,
  /** タップされたときのふくらみの大きさ（1 + この値まで） */
  tapPuff: 0.5,
  /** ふつうの跳ねの高さ */
  hopHeight: 12,
  /** つつく・見回す・指を見る、の長さ */
  peckMs: 560,
  scanMs: 1_000,
  lookMs: 900,
  /** 逃げるとき、この時間で速さを最大にする（飛び立つ） */
  takeoffMs: 260,
  /** 逃げるときに浮き上がる高さ */
  flyHeight: 40,
  /** 羽ばたきの速さ（1 秒の回数） */
  flapPerSec: 14,
  /** 指が触った・動いたのがこの時間の中なら、指の方をよく見る */
  pointerFreshMs: 4_000,
  /** 首を向けられる角度の上限 */
  neckLimit: 1.0,
} as const;

const J = BIRD_JOINT_MOTION;
/** まばたきの長さ */
const BLINK_MS = 120;

/** 首の付け根（体の中心から。右向きのとき） */
export const NECK_PIVOT = { x: 10, y: -6 };
/** 足の付け根の高さ（体を傾けるときの中心） */
export const HIP_Y = 8;

function restJoints(): BirdJoints {
  'worklet';
  return {
    lift: 0,
    lean: 0,
    puffX: 1,
    puffY: 1,
    neck: 0,
    headTurn: 1,
    wing: 0,
    wingSpread: 1,
    tail: 0,
    legFront: 0,
    legBack: 0,
    legLength: 1,
    eyeX: 0.4,
    eyeY: 0,
    blink: false,
  };
}

function clampTo(v: number, lo: number, hi: number): number {
  'worklet';
  return Math.max(lo, Math.min(hi, v));
}

/** なめらかに近づける（rate が大きいほど速い。毎秒の割合）。 */
function approach(from: number, to: number, dt: number, rate: number): number {
  'worklet';
  return from + (to - from) * (1 - Math.exp(-dt * rate));
}

/** 0〜1 の山（sin の半分）。 */
function bump(t: number): number {
  'worklet';
  return t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t);
}

/** 止まり始めに、することを選ぶ。指が最近触った・動いたなら、指の方をよく見る。 */
function chooseAct(state: BirdJointState, now: number, rand: Rand): void {
  'worklet';
  const p = state.pointer;
  const fresh = p !== null && now - p.at < J.pointerFreshMs;
  const r = rand();
  let act: BirdAct;
  if (fresh) act = r < 0.45 ? 'look' : r < 0.8 ? 'peck' : 'scan';
  else act = r < 0.55 ? 'peck' : r < 0.85 ? 'scan' : 'idle';
  const ms = act === 'peck' ? J.peckMs : act === 'scan' ? J.scanMs : act === 'look' ? J.lookMs : 0;
  state.act = act;
  state.actStart = now;
  state.actEnd = now + ms;
  state.gaze = act === 'look' && p ? { x: p.x, y: p.y } : null;
  // することが終わるまでは止まっている
  if (ms > 0) state.restUntil = Math.max(state.restUntil, now + ms);
}

/**
 * 点 target を見る首の角度と黒目のずれ。後ろにあるときは体の向き（dir）を変える。
 * 頭の位置は、体の向き・浮いている高さ・大きさから出す。
 */
function aimAt(state: BirdJointState, target: Vec, lift: number): { neck: number; eyeX: number; eyeY: number } {
  'worklet';
  const k = state.size;
  const hy = state.y - (lift - NECK_PIVOT.y) * k;
  let local = (target.x - (state.x + state.dir * NECK_PIVOT.x * k)) * state.dir;
  if (local < -4 * k) {
    // 後ろにいるので振り向く
    state.dir = state.dir === 1 ? -1 : 1;
    local = -local;
  }
  const dy = target.y - hy;
  const a = Math.atan2(dy, Math.max(local, 1));
  const neck = clampTo(a * 0.8, -J.neckLimit, J.neckLimit);
  // 首で向ききれない分は、黒目で向ける
  return { neck, eyeX: Math.cos(a - neck), eyeY: Math.sin(a - neck) };
}

/** このフレームの関節の角度を決める（step の後に呼ぶ）。 */
function poseJoints(state: BirdJointState, now: number, dt: number, rand: Rand, hopHeight: number): void {
  'worklet';
  const j = state.joints;
  const target = restJoints();
  let follow = 14; // 首・目の近づく速さ

  if (state.mode === 'caught') {
    // タップされた：ぴょんと跳び上がり、ふくらんでから縮む
    // 止まる時間は、ほかの獲物と同じ「捕まえた」の 0.4 秒（FR2.2・FR4.2。前の小鳥の部品が caughtUntil を決める）
    const t = clampTo((now - state.tapStart) / Math.max(1, state.caughtUntil - state.tapStart), 0, 1);
    target.lift = J.tapJump * bump(t / 0.7);
    let puff = 1;
    if (t < 0.3) puff = 1 + J.tapPuff * Math.sin((t / 0.3) * (Math.PI / 2));
    else if (t < 0.7) puff = 1 + J.tapPuff - (J.tapPuff + 0.2) * ((t - 0.3) / 0.4);
    else puff = 0.8 + 0.2 * ((t - 0.7) / 0.3);
    target.puffX = t >= 0.7 ? puff * 1.12 : puff;
    target.puffY = t >= 0.7 ? puff * 0.88 : puff;
    const open = t < 0.7 ? bump(t / 0.7) : 0;
    target.wing = 1.3 * open;
    target.wingSpread = 1 + 0.6 * open;
    target.tail = 0.6 * open;
    target.legFront = 0.35 * open;
    target.legBack = 0.5 * open;
    const aim = aimAt(state, state.caughtFrom, target.lift);
    target.neck = aim.neck;
    target.eyeX = aim.eyeX;
    target.eyeY = aim.eyeY;
    follow = 30;
  } else if (state.mode === 'flee') {
    // 逃げる：前に傾き、大きく速く羽ばたき、浮き上がる
    const t = clampTo((now - state.fleeStart) / 400, 0, 1);
    const flap = Math.sin(((now - state.fleeStart) / 1000) * J.flapPerSec * Math.PI * 2);
    target.lift = J.flyHeight * t;
    target.lean = 0.45;
    target.wing = 0.35 + 1.05 * flap;
    target.wingSpread = 1.7;
    target.tail = 0.35 + 0.15 * flap;
    target.legFront = 1.1;
    target.legBack = 1.1;
    target.legLength = 0.55;
    target.neck = -0.25;
    target.eyeX = 1;
    target.puffY = 1 - 0.06 * flap;
  } else if (state.mode === 'hop') {
    const span = state.hopEnd - state.hopStart;
    const t = span > 0 ? clampTo((now - state.hopStart) / span, 0, 1) : 1;
    const up = bump(t);
    target.lift = hopHeight * up;
    target.wing = 0.35 * up;
    target.tail = -0.25 * up;
    target.legFront = 0.45 * up;
    target.legBack = 0.6 * up;
    target.legLength = 1 - 0.25 * up;
    target.neck = -0.15 * up;
  } else if (state.mode === 'rest') {
    const span = state.actEnd - state.actStart;
    const t = span > 0 ? clampTo((now - state.actStart) / span, 0, 1) : 1;
    if (state.act === 'peck' && t < 1) {
      // 地面をつつく（2 回）：体を前に倒し、首を下げる
      const dip = Math.abs(Math.sin(t * Math.PI * 2));
      target.lean = 0.7 * dip;
      target.neck = 1.3 * dip;
      target.tail = 0.15 * dip;
      target.eyeX = 0.6;
      target.eyeY = 0.6;
      follow = 40;
    } else if (state.act === 'scan' && t < 1) {
      // きょろきょろ：頭を後ろ・前と振り向かせ、上も見る
      const turn = t < 0.25 ? 1 : t < 0.5 ? -1 : t < 0.75 ? 1 : -1;
      target.headTurn = t > 0.9 ? 1 : turn;
      target.neck = t < 0.5 ? -0.45 : -0.15;
      target.eyeX = 0.8;
      follow = 22;
    } else if (state.act === 'look' && t < 1 && state.gaze) {
      // 敵（指）の方を見る。見ている間に指が動いたら、動いた先を見る
      const p = state.pointer;
      if (p && p.at > state.actStart) state.gaze = { x: p.x, y: p.y };
      const aim = aimAt(state, state.gaze, 0);
      target.neck = aim.neck;
      target.eyeX = aim.eyeX;
      target.eyeY = aim.eyeY;
      // じっと見るときは少し体を起こし、しっぽを振る
      target.lean = -0.15;
      target.tail = 0.15 * Math.sin(((now - state.actStart) / 1000) * Math.PI * 6);
      follow = 18;
    }
  }

  // 首と目となめらかに。跳ねる・羽ばたく・ふくらむは、ずれると分かりにくいので、そのまま使う
  j.neck = approach(j.neck, target.neck, dt, follow);
  j.headTurn = approach(j.headTurn, target.headTurn, dt, follow * 1.4);
  j.eyeX = approach(j.eyeX, target.eyeX, dt, follow);
  j.eyeY = approach(j.eyeY, target.eyeY, dt, follow);
  j.lean = approach(j.lean, target.lean, dt, state.mode === 'rest' ? 40 : 16);
  j.tail = approach(j.tail, target.tail, dt, 30);
  j.lift = target.lift;
  j.puffX = target.puffX;
  j.puffY = target.puffY;
  j.wing = target.wing;
  j.wingSpread = target.wingSpread;
  j.legFront = target.legFront;
  j.legBack = target.legBack;
  j.legLength = target.legLength;

  // ときどきまばたき（逃げている間はしない）
  if (now >= state.blinkAt + BLINK_MS) state.blinkAt = now + 2_000 + rand() * 3_000;
  j.blink = state.mode !== 'flee' && state.mode !== 'caught' && now >= state.blinkAt;
}

export function birdJointBehavior(m: BirdMotion): Behavior<BirdJointState> {
  const base = birdHopBehavior(m);
  return {
    create(ctx) {
      'worklet';
      return {
        ...base.create(ctx),
        act: 'idle',
        actStart: 0,
        actEnd: 0,
        gaze: null,
        tapStart: 0,
        fleeStart: 0,
        blinkAt: ctx.now + 2_000 + ctx.rand() * 3_000,
        pointer: null,
        joints: restJoints(),
      };
    },
    watch(state, pointer) {
      'worklet';
      state.pointer = pointer;
    },
    step(state, field, now, dt, rand) {
      'worklet';
      const before = state.mode;
      // 飛び立つときは、だんだん速くする（位置の動きは今の小鳥の部品に任せ、進める時間だけを縮める）
      let moveDt = dt;
      if (before === 'flee') moveDt = dt * clampTo(0.25 + (now - state.fleeStart) / J.takeoffMs, 0.25, 1);
      const cue = base.step(state, field, now, moveDt, rand);
      if (state.mode !== before) {
        if (state.mode === 'flee') state.fleeStart = now;
        if (state.mode === 'rest' && !state.entering) chooseAct(state, now, rand);
        if (state.mode !== 'rest') state.act = 'idle';
      }
      poseJoints(state, now, dt, rand, J.hopHeight);
      return cue;
    },
    startle(state, from, field, now, rand) {
      'worklet';
      const before = state.mode;
      const cue = base.startle(state, from, field, now, rand);
      if (before !== 'caught' && state.mode === 'caught') {
        state.tapStart = now;
        state.act = 'idle';
      }
      return cue;
    },
    react(state, from, field, now, rand) {
      'worklet';
      const before = state.mode;
      const cue = base.react ? base.react(state, from, field, now, rand) : null;
      if (before !== 'flee' && state.mode === 'flee') {
        state.fleeStart = now;
        state.act = 'idle';
      }
      return cue;
    },
    isOnScreen(state, field) {
      'worklet';
      return base.isOnScreen(state, field);
    },
    isVisible(state) {
      'worklet';
      return base.isVisible(state);
    },
    distanceTo(state, p) {
      'worklet';
      return base.distanceTo(state, p);
    },
    hitRadius(state) {
      'worklet';
      return base.hitRadius(state);
    },
    recallRank(state, now) {
      'worklet';
      return base.recallRank(state, now);
    },
    recall(state, field, now) {
      'worklet';
      base.recall(state, field, now);
    },
  };
}
