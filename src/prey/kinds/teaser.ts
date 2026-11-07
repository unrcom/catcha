/** 猫じゃらしの定義（FR1.2・FR1.3）。値は v0.0.0 と同じ（動きと速さは toyMotion.ts の MOTION）。 */
import { MOTION } from '../../ui/toyMotion';
import { type ToyAgentState } from '../behaviors/strand';
import { teaserBehavior } from '../behaviors/teaser';
import { drawTeaser } from '../render/teaser';
import type { PreyKind } from '../types';

export const teaserKind: PreyKind<ToyAgentState> = {
  id: 'teaser',
  behavior: teaserBehavior,
  render: drawTeaser,
  sounds: {
    // 素早く飛び始めたとき・画面に出てきたとき（「ボヨーン」）
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    move: { sources: [require('../../../assets/sounds/teaser.wav')], minGapMs: 1000 },
  },
  size: { tablet: 1, phone: MOTION.phoneToyScale },
  color: 2,
};
