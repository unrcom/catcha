/**
 * 関節のある小鳥を Skia で描く（試し。EXPO_PUBLIC_BIRD_JOINTS=1 のときだけ使う）。
 * 形と色は今の小鳥（render/bird.ts）に合わせ、部品（体・頭・くちばし・目・羽・しっぽ・足）を
 * 関節のまわりに回して描く。角度は動きの部品（behaviors/birdJoint.ts）が毎フレーム決めたものを使う。
 *
 * 親子のつながり（右向きで描き、左へ向くときは左右を反転する）：
 *   位置 → 足（地面に立つ）
 *        → 上半身（足の付け根のまわりに傾く・ふくらむ） → しっぽ・体・羽
 *                                                      → 首 → 頭 → くちばし・目
 */
import { Skia, type SkCanvas } from '@shopify/react-native-skia';

import { HIP_Y, NECK_PIVOT, type BirdJointState } from '../behaviors/birdJoint';
import type { DrawContext, Render } from '../types';
import { setFill, setStroke } from './strand';

/** 目と羽の線の色（体の色の上に描く。今の小鳥と同じ） */
const BIRD_DETAIL_COLOR = '#111111';
/** 頭の中心（首の付け根から） */
const HEAD_OFFSET = { x: 4, y: -6 };
const HEAD_RADIUS = 9;
/** 羽の付け根（体の中心から） */
const SHOULDER = { x: 4, y: -4 };

/** 羽 1 枚（付け根が原点、たたむと後ろ向き）。spread で長くする。 */
function wingPath(k: number, spread: number) {
  'worklet';
  const l = 20 * spread;
  return Skia.PathBuilder.Make()
    .moveTo(0, -2 * k)
    .quadTo(-l * 0.4 * k, -7 * k, -l * k, -1 * k)
    .quadTo(-l * 0.45 * k, 4 * k, 0, 3 * k)
    .close()
    .detach();
}

function drawLeg(canvas: SkCanvas, hipX: number, angle: number, length: number, k: number, ctx: DrawContext): void {
  'worklet';
  const len = 10 * length;
  const ax = hipX - Math.sin(angle) * len;
  const ay = HIP_Y + Math.cos(angle) * len;
  const leg = Skia.PathBuilder.Make()
    .moveTo(hipX * k, HIP_Y * k)
    .lineTo(ax * k, ay * k)
    .moveTo((ax - 2) * k, ay * k)
    .lineTo((ax + 3) * k, ay * k)
    .detach();
  canvas.drawPath(leg, ctx.stroke);
}

export const drawBirdJoint: Render<BirdJointState> = (canvas, state, ctx) => {
  'worklet';
  if (state.mode === 'away') return;
  const j = state.joints;
  const k = state.size;
  const outline = ctx.outline;

  canvas.save();
  canvas.translate(state.x, state.y - j.lift * k);
  canvas.scale(state.dir, 1);

  // 足（上半身より先に描き、体の後ろに隠す）
  setStroke(ctx.stroke, ctx.color, 2.5 * k);
  drawLeg(canvas, -3, j.legBack, j.legLength, k, ctx);
  drawLeg(canvas, 4, j.legFront, j.legLength, k, ctx);

  // 上半身：足の付け根のまわりに傾け、体の中心でふくらませる
  canvas.save();
  canvas.translate(0, HIP_Y * k);
  canvas.rotate((j.lean * 180) / Math.PI, 0, 0);
  canvas.translate(0, -HIP_Y * k);
  canvas.scale(j.puffX, j.puffY);

  const flying = j.wingSpread > 1.05;
  // 奥の羽（広げているときだけ見える）
  if (flying) {
    canvas.save();
    canvas.translate(SHOULDER.x * k, SHOULDER.y * k);
    canvas.rotate((j.wing * 0.8 * 180) / Math.PI, 0, 0);
    const back = wingPath(k, j.wingSpread * 0.9);
    setFill(ctx.fill, ctx.color, 0.75);
    canvas.drawPath(back, ctx.fill);
    setStroke(ctx.stroke, outline ?? BIRD_DETAIL_COLOR, 1.5 * k, outline ? 1 : 0.4);
    canvas.drawPath(back, ctx.stroke);
    canvas.restore();
  }

  // しっぽ（付け根のまわりに回す）
  canvas.save();
  canvas.translate(-12 * k, 0);
  canvas.rotate((j.tail * 180) / Math.PI, 0, 0);
  const tail = Skia.PathBuilder.Make()
    .moveTo(0, -4 * k)
    .lineTo(-18 * k, -12 * k)
    .lineTo(-16 * k, 0)
    .lineTo(0, 3 * k)
    .detach();
  setFill(ctx.fill, ctx.color);
  canvas.drawPath(tail, ctx.fill);
  if (outline) {
    setStroke(ctx.stroke, outline, 2 * k);
    canvas.drawPath(tail, ctx.stroke);
  }
  canvas.restore();

  // 体
  const body = Skia.XYWHRect(-18 * k, -11 * k, 34 * k, 22 * k);
  setFill(ctx.fill, ctx.color);
  canvas.drawOval(body, ctx.fill);
  if (outline) {
    setStroke(ctx.stroke, outline, 2 * k);
    canvas.drawOval(body, ctx.stroke);
  }

  // 首 → 頭 → くちばし・目
  canvas.save();
  canvas.translate(NECK_PIVOT.x * k, NECK_PIVOT.y * k);
  canvas.rotate((j.neck * 180) / Math.PI, 0, 0);
  canvas.translate(HEAD_OFFSET.x * k, HEAD_OFFSET.y * k);
  // 振り向くときは、頭だけを左右に反転する（間の値は横向きの途中）
  canvas.scale(j.headTurn, 1);
  const beak = Skia.PathBuilder.Make()
    .moveTo(7 * k, -3 * k)
    .lineTo(16 * k, 1 * k)
    .lineTo(7 * k, 4 * k)
    .detach();
  setFill(ctx.fill, ctx.color);
  canvas.drawCircle(0, 0, HEAD_RADIUS * k, ctx.fill);
  canvas.drawPath(beak, ctx.fill);
  if (outline) {
    setStroke(ctx.stroke, outline, 2 * k);
    canvas.drawCircle(0, 0, HEAD_RADIUS * k, ctx.stroke);
  }
  // 目：黒目を見る方へずらす。まばたきのときは線
  const ex = (3 + j.eyeX * 1.4) * k;
  const ey = (-2 + j.eyeY * 1.4) * k;
  if (j.blink) {
    setStroke(ctx.stroke, BIRD_DETAIL_COLOR, 1.5 * k);
    canvas.drawLine(ex - 2 * k, ey, ex + 2 * k, ey, ctx.stroke);
  } else {
    setFill(ctx.fill, BIRD_DETAIL_COLOR);
    canvas.drawCircle(ex, ey, 2 * k, ctx.fill);
  }
  canvas.restore();

  // 手前の羽（付け根のまわりに回す）。たたんでいるときは今の小鳥と同じ線だけ
  canvas.save();
  canvas.translate(SHOULDER.x * k, SHOULDER.y * k);
  canvas.rotate((j.wing * 180) / Math.PI, 0, 0);
  if (flying || j.wing > 0.2) {
    const wing = wingPath(k, j.wingSpread);
    setFill(ctx.fill, ctx.color);
    canvas.drawPath(wing, ctx.fill);
    setStroke(ctx.stroke, outline ?? BIRD_DETAIL_COLOR, 1.5 * k, outline ? 1 : 0.4);
    canvas.drawPath(wing, ctx.stroke);
  } else {
    const fold = Skia.PathBuilder.Make()
      .moveTo(-16 * k, 2 * k)
      .quadTo(-4 * k, -4 * k, 4 * k, 3 * k)
      .detach();
    setStroke(ctx.stroke, BIRD_DETAIL_COLOR, 1.5 * k, 0.4);
    canvas.drawPath(fold, ctx.stroke);
  }
  canvas.restore();

  canvas.restore();
  canvas.restore();
};
