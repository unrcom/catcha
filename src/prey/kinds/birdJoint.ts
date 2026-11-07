/**
 * 関節のある小鳥の定義（試し）。開発用の切り替え EXPO_PUBLIC_BIRD_JOINTS=1 のときだけ、
 * 種類の一覧（kinds/index.ts）で今の小鳥（bird）と入れ替える。ふだんは出ない。
 * 位置の動きの数・大きさ・音・色は今の小鳥と同じ。
 */
import { birdJointBehavior, type BirdJointState } from '../behaviors/birdJoint';
import { drawBirdJoint } from '../render/birdJoint';
import type { PreyKind } from '../types';
import { BIRD_MOTION, BIRD_SIZE, birdKind } from './bird';

export const birdJointKind: PreyKind<BirdJointState> = {
  id: 'birdJoint',
  behavior: birdJointBehavior(BIRD_MOTION),
  render: drawBirdJoint,
  sounds: birdKind.sounds,
  size: BIRD_SIZE,
  color: birdKind.color,
};
