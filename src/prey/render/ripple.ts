/**
 * ネコが当てた場所に広がる波紋を Skia で描く（FR4.3）。形・色・太さは v0.0.0 の SVG（PlayField の RippleShape）と同じ。
 */
import type { SkCanvas, SkPaint } from '@shopify/react-native-skia';

import type { Ripple } from '../types';
import { setStroke } from './strand';

export const RIPPLE_MS = 700;
/** 少しずつ遅れて広がる3つの輪 */
export const RIPPLE_RINGS = [0, 0.22, 0.44];
/** 最後の輪が広がり終わるまで（これを過ぎた波紋は消す） */
export const RIPPLE_LIFE_MS = RIPPLE_MS * (1 + RIPPLE_RINGS[RIPPLE_RINGS.length - 1]);

export function drawRipple(canvas: SkCanvas, ripple: Ripple, color: string, now: number, stroke: SkPaint): void {
  'worklet';
  RIPPLE_RINGS.forEach((delay) => {
    const t = (now - ripple.start) / RIPPLE_MS - delay;
    if (t <= 0 || t >= 1) return;
    const eased = 1 - (1 - t) * (1 - t); // はじめ速く、だんだんゆっくり広がる
    setStroke(stroke, color, 4 * (1 - t) + 1, 1 - t);
    canvas.drawCircle(ripple.x, ripple.y, 10 + eased * 70, stroke);
  });
}
