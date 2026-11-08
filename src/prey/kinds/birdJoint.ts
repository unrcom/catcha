/**
 * 関節と視線のある小鳥の定義（範囲の変更、2026-11-07 から v0.1 の小鳥）。種類の一覧（kinds/index.ts）で前の小鳥と入れ替わる。
 * 入れ替わるので ID は前と同じ bird にした（設定に保存した種類ごとの数を、そのまま使える）。
 * 位置の動きの数・大きさ・音・色は前の小鳥と同じ。
 */
import { birdJointBehavior, type BirdJointState } from '../behaviors/birdJoint';
import { drawBirdJoint } from '../render/birdJoint';
import type { PreyKind } from '../types';
import { BIRD_MOTION, BIRD_SIZE, birdKind } from './bird';

export const birdJointKind: PreyKind<BirdJointState> = {
  id: 'bird',
  label: '小鳥',
  behavior: birdJointBehavior(BIRD_MOTION),
  render: drawBirdJoint,
  sounds: birdKind.sounds,
  size: BIRD_SIZE,
  color: birdKind.color,
};
