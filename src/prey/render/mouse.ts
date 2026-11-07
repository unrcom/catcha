/**
 * ネズミを Skia で描く（FR3.1）。形・色・太さは v0.0.0 の SVG（PlayField の MouseShape）と同じ。
 * 右向きに描いて、進む向きへ回す（左へ進むときは左右を反転）。
 * 足は走った道のり（stride）に合わせて前後に振るので、止まっている間は動かない。
 */
import { Skia } from '@shopify/react-native-skia';

import { MOTION } from '../../ui/toyMotion';
import type { MouseAgentState } from '../behaviors/mouse';
import type { Render } from '../types';
import { setFill, setStroke } from './strand';

/** 足の付け根（体の中心から見た位置。右向きのとき）と、前後に振る調子（対角の足が同じ向きに動く） */
const MOUSE_LEGS = [
  { x: 14, phase: 0 }, // 前足（手前）
  { x: -14, phase: Math.PI }, // 後ろ足（手前）
  { x: 18, phase: Math.PI }, // 前足（奥）
  { x: -10, phase: 0 }, // 後ろ足（奥）
];

export const drawMouse: Render<MouseAgentState> = (canvas, state, ctx) => {
  'worklet';
  const mouse = state.mouse;
  if (!mouse.active) return;
  const { x, y, dir, angle, stride } = mouse;
  const k = mouse.size;
  // 左向きは反転して描くので、傾きは反転した向きから見た角度にする
  const tilt = ((dir === 1 ? angle : Math.PI - angle) * 180) / Math.PI;
  const swingPhase = (stride / (MOTION.mouseStepLength * k)) * Math.PI * 2;
  const legLength = 13 * k;

  canvas.save();
  canvas.translate(x, y);
  canvas.scale(dir, 1);
  canvas.rotate(tilt, 0, 0);

  MOUSE_LEGS.forEach((leg, i) => {
    const swing = Math.sin(swingPhase + leg.phase) * 0.7;
    const hipX = leg.x * k;
    const hipY = 8 * k;
    const legPath = Skia.PathBuilder.Make()
      .moveTo(hipX, hipY)
      .lineTo(hipX + Math.sin(swing) * legLength, hipY + Math.cos(swing) * legLength)
      .detach();
    setStroke(ctx.stroke, ctx.color, 4 * k, i >= 2 ? 0.7 : 1);
    canvas.drawPath(legPath, ctx.stroke);
  });

  const tail = Skia.PathBuilder.Make()
    .moveTo(-26 * k, 0)
    .quadTo(-50 * k, -18 * k, -70 * k, 4 * k)
    .detach();
  setStroke(ctx.stroke, ctx.color, 4 * k);
  canvas.drawPath(tail, ctx.stroke);

  const body = Skia.XYWHRect(-28 * k, -16 * k, 56 * k, 32 * k);
  const circles = [
    { cx: 24 * k, cy: -4 * k, r: 11 * k }, // 頭
    { cx: 20 * k, cy: -16 * k, r: 6 * k }, // 耳
  ];
  setFill(ctx.fill, ctx.color);
  canvas.drawOval(body, ctx.fill);
  if (ctx.outline) {
    setStroke(ctx.stroke, ctx.outline, 2 * k);
    canvas.drawOval(body, ctx.stroke);
  }
  circles.forEach((c) => {
    canvas.drawCircle(c.cx, c.cy, c.r, ctx.fill);
    if (ctx.outline) canvas.drawCircle(c.cx, c.cy, c.r, ctx.stroke);
  });

  canvas.restore();
};
