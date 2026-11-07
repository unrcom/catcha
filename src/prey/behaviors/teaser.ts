/**
 * 猫じゃらしの動きの部品（FR1.1・FR1.3）。動きは toyMotion.ts の関数をそのまま使う。
 * 状態：止まる・素早く飛ぶ・小刻みに揺れる・捕まって止まっている・引っ込む・隠れている・伸びて出てくる（teaser.phase）
 */
import {
  callBackTeaser,
  distanceToToy,
  // worklet にした部品のメソッドと同じ名前にならないよう、別の名前で使う
  hitRadius as toyHitRadius,
  isToyOnScreen,
  isToyVisible,
  startle as startleToy,
} from '../../ui/toyMotion';
import { RECALL_TIER, type Behavior, type RecallRank } from '../types';
import { createToyState, stepToyState, type ToyAgentState } from './strand';

export const teaserBehavior: Behavior<ToyAgentState> = {
  create(ctx) {
    'worklet';
    return createToyState('teaser', ctx);
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
    // 隠れている猫じゃらしは、下から伸びてすぐ見えるので、いちばん先に呼び戻す
    return state.toy.teaser?.phase === 'hidden' ? { tier: RECALL_TIER.popUp, order: 0 } : null;
  },
  recall(state, _field, now) {
    'worklet';
    callBackTeaser(state.toy, now);
  },
};
