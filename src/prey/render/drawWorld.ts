/**
 * 獲物の世界を 1 枚の Skia の Picture に描く（FR3.1・FR4.3）。UI スレッドで毎フレーム呼ぶ（'worklet'）。
 * 描き方と色は種類の定義から引く（kinds/index.ts の PREY_RENDERERS・PREY_COLORS）。ここには種類ごとの分岐を書かない。
 * 描く順番：獲物（種類の一覧の順）→ 波紋（いちばん上）。
 */
import { createPicture, PaintStyle, Skia, type SkPicture } from '@shopify/react-native-skia';

import type { ToyPalette } from '../../ui/theme';
import { PREY_BEHAVIORS, PREY_COLORS, PREY_RENDERERS } from '../kinds';
import type { PreyColor, World } from '../types';
import { drawRipple } from './ripple';

/** 色の番号を、遊び画面の色（背景の明暗で変わる）の色にする。 */
export function colorOf(color: PreyColor, palette: ToyPalette): string {
  'worklet';
  if (color === 'mouse') return palette.mouse;
  return palette.toys[color % palette.toys.length];
}

/**
 * 世界を描く。skipKinds の種類は描かない（Skia の上に重ねた表示で描いているもの）。
 */
export function drawWorld(world: World, palette: ToyPalette, now: number, skipKinds: readonly string[]): SkPicture {
  'worklet';
  return createPicture((canvas) => {
    const stroke = Skia.Paint();
    stroke.setAntiAlias(true);
    stroke.setStyle(PaintStyle.Stroke);
    const fill = Skia.Paint();
    fill.setAntiAlias(true);
    fill.setStyle(PaintStyle.Fill);

    for (const a of world.agents) {
      if (skipKinds.includes(a.kind)) continue;
      if (!PREY_BEHAVIORS[a.kind].isVisible(a.state)) continue;
      PREY_RENDERERS[a.kind](canvas, a.state, {
        color: colorOf(PREY_COLORS[a.kind], palette),
        outline: palette.outline,
        now,
        stroke,
        fill,
      });
    }
    for (const r of world.ripples) drawRipple(canvas, r, colorOf(r.color, palette), now, stroke);
  });
}
