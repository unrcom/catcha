/** ネズミの定義（FR1.2・FR1.3）。値は v0.0.0 と同じ（動きと速さは toyMotion.ts の MOTION）。 */
import { MOTION } from '../../ui/toyMotion';
import { mouseBehavior, type MouseAgentState } from '../behaviors/mouse';
import { drawMouse } from '../render/mouse';
import type { PreyKind } from '../types';

/* eslint-disable @typescript-eslint/no-require-imports */
export const mouseKind: PreyKind<MouseAgentState> = {
  id: 'mouse',
  label: 'ネズミ',
  behavior: mouseBehavior,
  render: drawMouse,
  sounds: {
    // 足音「テ」「ケ」。交互に鳴らして「テケテケ」にする（逃げるときの速い足どりでも続けて鳴るように間隔は短く）
    step: {
      sources: [require('../../../assets/sounds/mouse-te.wav'), require('../../../assets/sounds/mouse-ke.wav')],
      minGapMs: 60,
    },
  },
  // スマートフォンのネズミは、タブレットより小さく描く
  size: { tablet: MOTION.mouseScale, phone: MOTION.phoneMouseScale },
  color: 'mouse',
};
/* eslint-enable @typescript-eslint/no-require-imports */
