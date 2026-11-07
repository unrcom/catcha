/**
 * 小鳥を Skia で描く（FR2.9 の Rive が使えないときの描き方・FR3.1）。
 * 横から見た小さな鳥を右向きに描き、左へ進むときは左右を反転する。
 * - 跳ねている間は、跳ねの高さ（lift）だけ上に浮く
 * - 逃げている間は、羽を広げて上下に羽ばたく（足はたたむ）
 */
import { Skia } from '@shopify/react-native-skia';

import { birdPose, type BirdState } from '../behaviors/birdHop';
import type { Render } from '../types';
import { setFill, setStroke } from './strand';

/** 目と羽の線の色（体の色の上に描く） */
const BIRD_DETAIL_COLOR = '#111111';
/** 跳ねたときに浮く高さ（大きさ 1 のとき） */
const HOP_HEIGHT = 10;
/** 羽ばたきの速さ（1 秒の回数） */
const FLAP_PER_SEC = 12;

export const drawBird: Render<BirdState> = (canvas, state, ctx) => {
  'worklet';
  const pose = birdPose(state, ctx.now);
  if (!pose.visible) return;
  const k = pose.size;

  canvas.save();
  canvas.translate(pose.x, pose.y - pose.lift * HOP_HEIGHT * k);
  canvas.scale(pose.dir, 1);

  // 足（逃げている間はたたむ）
  if (!pose.flying) {
    setStroke(ctx.stroke, ctx.color, 2.5 * k);
    [-3, 4].forEach((hipX) => {
      const leg = Skia.PathBuilder.Make()
        .moveTo(hipX * k, 9 * k)
        .lineTo((hipX - 2) * k, 19 * k)
        .lineTo((hipX + 2) * k, 19 * k)
        .detach();
      canvas.drawPath(leg, ctx.stroke);
    });
  }

  // しっぽ・体・頭・くちばし
  const tail = Skia.PathBuilder.Make()
    .moveTo(-12 * k, -4 * k)
    .lineTo(-30 * k, -12 * k)
    .lineTo(-28 * k, 0)
    .lineTo(-12 * k, 3 * k)
    .detach();
  const body = Skia.XYWHRect(-18 * k, -11 * k, 34 * k, 22 * k);
  const beak = Skia.PathBuilder.Make()
    .moveTo(21 * k, -15 * k)
    .lineTo(30 * k, -11 * k)
    .lineTo(21 * k, -8 * k)
    .detach();
  setFill(ctx.fill, ctx.color);
  canvas.drawPath(tail, ctx.fill);
  canvas.drawOval(body, ctx.fill);
  canvas.drawCircle(14 * k, -12 * k, 9 * k, ctx.fill);
  canvas.drawPath(beak, ctx.fill);
  if (ctx.outline) {
    setStroke(ctx.stroke, ctx.outline, 2 * k);
    canvas.drawPath(tail, ctx.stroke);
    canvas.drawOval(body, ctx.stroke);
    canvas.drawCircle(14 * k, -12 * k, 9 * k, ctx.stroke);
  }

  // 羽：歩いている間はたたんだ線、逃げている間は広げて羽ばたく
  if (pose.flying) {
    const flap = Math.sin((ctx.now / 1000) * FLAP_PER_SEC * Math.PI * 2);
    const tipY = -6 * k - flap * 24 * k;
    const wing = Skia.PathBuilder.Make()
      .moveTo(-8 * k, -6 * k)
      .quadTo(-4 * k, tipY, 10 * k, tipY * 0.9)
      .lineTo(6 * k, -4 * k)
      .detach();
    setFill(ctx.fill, ctx.color);
    canvas.drawPath(wing, ctx.fill);
    setStroke(ctx.stroke, ctx.outline ?? BIRD_DETAIL_COLOR, 1.5 * k, ctx.outline ? 1 : 0.4);
    canvas.drawPath(wing, ctx.stroke);
  } else {
    const fold = Skia.PathBuilder.Make()
      .moveTo(-12 * k, -2 * k)
      .quadTo(0, -8 * k, 8 * k, -1 * k)
      .detach();
    setStroke(ctx.stroke, BIRD_DETAIL_COLOR, 1.5 * k, 0.4);
    canvas.drawPath(fold, ctx.stroke);
  }

  // 目
  setFill(ctx.fill, BIRD_DETAIL_COLOR);
  canvas.drawCircle(17 * k, -14 * k, 2 * k, ctx.fill);

  canvas.restore();
};
