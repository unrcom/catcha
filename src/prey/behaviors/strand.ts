/**
 * 紐・しっぽの動きの部品（FR1.1・FR1.3）。動きは toyMotion.ts の関数をそのまま使う（値と動きを変えない）。
 * 状態：隠れている（travel.visible = false）・横切っている・捕まって止まっている（caughtUntil）・逃げている（startledUntil）
 */
import {
  callBackTraveler,
  createToys,
  distanceToToy,
  // worklet にした部品のメソッドと同じ名前にならないよう、別の名前で使う
  hitRadius as toyHitRadius,
  isToyOnScreen,
  isToyVisible,
  startle as startleToy,
  stepToy,
  turnTravelerToCenter,
  type Toy,
  type ToyKind,
} from '../../ui/toyMotion';
import { RECALL_TIER, type Behavior, type CreateContext, type Field, type Rand, type RecallRank } from '../types';

/** 紐・しっぽ・猫じゃらしの状態。toy は toyMotion.ts の形のまま。 */
export type ToyAgentState = {
  toy: Toy;
  /** 前のフレームで画面に見えていたか（見えていない → 見えたときに音を鳴らす） */
  wasOnScreen: boolean;
};

/** 登場の時刻をずらす間隔（今は紐 0 秒・しっぽ 0.6 秒。6 匹目からは同じずらし方を繰り返す） */
const ENTRY_STAGGER_MS = 600;
const ENTRY_STAGGER_CYCLE = 5;

/** toyMotion.ts の 1 本を作る。スマートフォンの大きさは toyMotion.ts の phoneToyScale（定義の size と同じ値）。 */
export function createToyState(kind: ToyKind, ctx: CreateContext): ToyAgentState {
  'worklet';
  const toy = createToys(ctx.field, { kinds: [kind], colors: [''], isTablet: ctx.isTablet, now: ctx.now }, ctx.rand)[0];
  if (toy.travel) toy.travel.enterAt += (ctx.order % ENTRY_STAGGER_CYCLE) * ENTRY_STAGGER_MS;
  return { toy, wasOnScreen: false };
}

/** 1 フレーム進める。猫じゃらしが素早く飛び始めたとき・画面に入ってきて見えたときに 'move' を返す。 */
export function stepToyState(state: ToyAgentState, field: Field, now: number, dt: number, rand: Rand): string | null {
  'worklet';
  const darted = stepToy(state.toy, field, now, dt, rand);
  const onScreen = isToyOnScreen(state.toy, field);
  const appeared = onScreen && !state.wasOnScreen;
  state.wasOnScreen = onScreen;
  return darted || appeared ? 'move' : null;
}

export function strandBehavior(kind: 'string' | 'tail'): Behavior<ToyAgentState> {
  return {
    create(ctx) {
      'worklet';
      return createToyState(kind, ctx);
    },
    step(state, field, now, dt, rand) {
      'worklet';
      return stepToyState(state, field, now, dt, rand);
    },
    startle(state, from, field, now) {
      'worklet';
      startleToy(state.toy, from, field, now);
      return null;
    },
    isOnScreen(state, field) {
      'worklet';
      return isToyOnScreen(state.toy, field);
    },
    isVisible(state) {
      'worklet';
      return isToyVisible(state.toy);
    },
    distanceTo(state, p) {
      'worklet';
      return distanceToToy(state.toy, p);
    },
    hitRadius(state) {
      'worklet';
      return toyHitRadius(state.toy);
    },
    recallRank(state): RecallRank | null {
      'worklet';
      const t = state.toy.travel;
      if (!t) return null;
      // 隠れているものは早く入ってくる予定のものから。画面の外を通っているものは向け直す
      return t.visible ? { tier: RECALL_TIER.redirect, order: 0 } : { tier: RECALL_TIER.enter, order: t.enterAt };
    },
    recall(state, field, now) {
      'worklet';
      if (state.toy.travel?.visible) turnTravelerToCenter(state.toy, field, now);
      else callBackTraveler(state.toy, now);
    },
  };
}
