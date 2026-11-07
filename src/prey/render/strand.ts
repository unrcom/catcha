/**
 * 紐・しっぽを Skia で描く（FR3.1）。形・色・太さは v0.0.0 の SVG（PlayField の ToyShape）と同じ。
 * 猫じゃらしの軸も同じ描き方を使う（render/teaser.ts）。
 */
import { Skia, StrokeCap, StrokeJoin, type SkCanvas, type SkPaint } from '@shopify/react-native-skia';

import type { Toy } from '../../ui/toyMotion';
import type { ToyAgentState } from '../behaviors/strand';
import type { DrawContext, Render } from '../types';

/** 線の筆を整える（端と角は丸く）。 */
export function setStroke(paint: SkPaint, color: string, width: number, alpha = 1): void {
  'worklet';
  paint.setColor(Skia.Color(color));
  paint.setAlphaf(alpha);
  paint.setStrokeWidth(width);
  paint.setStrokeCap(StrokeCap.Round);
  paint.setStrokeJoin(StrokeJoin.Round);
}

/** 塗りの筆を整える。 */
export function setFill(paint: SkPaint, color: string, alpha = 1): void {
  'worklet';
  paint.setColor(Skia.Color(color));
  paint.setAlphaf(alpha);
}

/** 触られた直後は「ビクッ」と少し膨らむ。 */
export function toyWidth(toy: Toy, now: number): number {
  'worklet';
  return toy.startledUntil > now ? toy.width * 1.3 : toy.width;
}

/** 体の線（points を順につないだ折れ線）。縁取りがあれば先に太く描く。 */
export function drawToyBody(canvas: SkCanvas, toy: Toy, lineWidth: number, ctx: DrawContext): void {
  'worklet';
  const builder = Skia.PathBuilder.Make();
  toy.points.forEach((p, i) => {
    if (i === 0) builder.moveTo(p.x, p.y);
    else builder.lineTo(p.x, p.y);
  });
  const path = builder.detach();
  if (ctx.outline) {
    setStroke(ctx.stroke, ctx.outline, lineWidth + 4);
    canvas.drawPath(path, ctx.stroke);
  }
  setStroke(ctx.stroke, ctx.color, lineWidth);
  canvas.drawPath(path, ctx.stroke);
}

export const drawStrand: Render<ToyAgentState> = (canvas, state, ctx) => {
  'worklet';
  drawToyBody(canvas, state.toy, toyWidth(state.toy, ctx.now), ctx);
};
