/**
 * 猫じゃらしを Skia で描く（FR3.1）。形・色・太さは v0.0.0 の SVG（PlayField の ToyShape・TeaserPuff）と同じ。
 * 軸はふさより細い線、先のふさは細い毛を放射状に描いて少しずつ揺らす。
 */
import { Skia } from '@shopify/react-native-skia';

import { MOTION } from '../../ui/toyMotion';
import type { ToyAgentState } from '../behaviors/strand';
import type { Render } from '../types';
import { drawToyBody, setFill, setStroke, toyWidth } from './strand';

const PUFF_STRANDS = 10;

export const drawTeaser: Render<ToyAgentState> = (canvas, state, ctx) => {
  'worklet';
  const toy = state.toy;
  const width = toyWidth(toy, ctx.now);
  // 猫じゃらしの軸は、ふさより細い線にする
  drawToyBody(canvas, toy, Math.max(2, width * 0.5), ctx);

  const tip = toy.points[0];
  const next = toy.points[1] ?? tip;
  const base = Math.atan2(tip.y - next.y, tip.x - next.x); // 軸の向き（ふさは先の方へ広がる）
  const sway = Math.sin((toy.teaser?.clock ?? 0) * 9) * 0.25;
  const size = width * MOTION.teaserPuffScale;
  const len = size * 6;
  const strands = Skia.PathBuilder.Make();
  for (let i = 0; i < PUFF_STRANDS; i += 1) {
    const a = base + sway + (i / (PUFF_STRANDS - 1) - 0.5) * 2.4;
    const l = len * (0.75 + 0.25 * Math.sin(i * 1.7));
    strands.moveTo(tip.x, tip.y);
    strands.lineTo(tip.x + Math.cos(a) * l, tip.y + Math.sin(a) * l);
  }
  setStroke(ctx.stroke, ctx.color, Math.max(2, size * 0.6));
  canvas.drawPath(strands.detach(), ctx.stroke);
  setFill(ctx.fill, ctx.color);
  canvas.drawCircle(tip.x, tip.y, size * 1.6, ctx.fill);
};
