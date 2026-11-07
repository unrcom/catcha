/** しっぽの定義（FR1.2・FR1.3）。値は v0.0.0 と同じ（動きと速さは toyMotion.ts の MOTION）。 */
import { MOTION } from '../../ui/toyMotion';
import { strandBehavior, type ToyAgentState } from '../behaviors/strand';
import { drawStrand } from '../render/strand';
import type { PreyKind } from '../types';

export const tailKind: PreyKind<ToyAgentState> = {
  id: 'tail',
  label: 'しっぽ',
  behavior: strandBehavior('tail'),
  render: drawStrand,
  sounds: {
    // 画面に入ってきて見えたとき
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    move: { sources: [require('../../../assets/sounds/tail.wav')], minGapMs: 1000 },
  },
  size: { tablet: 1, phone: MOTION.phoneToyScale },
  color: 1,
};
