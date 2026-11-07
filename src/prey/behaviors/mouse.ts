/**
 * ネズミの動きの部品（FR1.1・FR1.3）。動きは toyMotion.ts の関数をそのまま使う。
 * 状態：いない（active = false）・走る・止まる・出ていく・捕まって止まっている・逃げる（mouse.mode・caughtUntil）
 */
import {
  callBackMouse,
  createMouse,
  isMouseOnScreen,
  MOTION,
  startleMouse,
  stepMouse,
  type Mouse,
} from '../../ui/toyMotion';
import { RECALL_TIER, type Behavior, type RecallRank } from '../types';

/** ネズミの当たる範囲（大きさ1のとき） */
export const MOUSE_HIT_RADIUS = 48;

export type MouseAgentState = {
  mouse: Mouse;
  /** 足が地面についた回数（足の1往復の半分ごと。走った道のりで数える） */
  lastStepCount: number;
};

export const mouseBehavior: Behavior<MouseAgentState> = {
  create(ctx) {
    'worklet';
    return { mouse: createMouse(ctx.now, ctx.rand, ctx.scale), lastStepCount: 0 };
  },
  step(state, field, now, dt, rand) {
    'worklet';
    const m = state.mouse;
    stepMouse(m, field, now, dt, rand);
    // ネズミの足が地面につくたびに足音を鳴らす
    const stepCount = Math.floor(m.stride / ((MOTION.mouseStepLength * m.size) / 2));
    const stepped = stepCount !== state.lastStepCount && isMouseOnScreen(m, field);
    state.lastStepCount = stepCount;
    return stepped ? 'step' : null;
  },
  startle(state, _from, _field, now, rand) {
    'worklet';
    startleMouse(state.mouse, now, rand);
    return null;
  },
  isOnScreen(state, field) {
    'worklet';
    return isMouseOnScreen(state.mouse, field);
  },
  isVisible(state) {
    'worklet';
    return state.mouse.active;
  },
  distanceTo(state, p) {
    'worklet';
    const m = state.mouse;
    if (!m.active) return Number.POSITIVE_INFINITY;
    return Math.hypot(m.x - p.x, m.y - p.y);
  },
  hitRadius(state) {
    'worklet';
    return MOUSE_HIT_RADIUS * state.mouse.size;
  },
  recallRank(state): RecallRank | null {
    'worklet';
    return state.mouse.active ? null : { tier: RECALL_TIER.appear, order: state.mouse.nextAppearAt };
  },
  recall(state, _field, now) {
    'worklet';
    callBackMouse(state.mouse, now);
  },
};
