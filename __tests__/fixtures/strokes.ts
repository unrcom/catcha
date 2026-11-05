import type { Point } from '../../src/domain/alphaGesture';

/**
 * 「α」の判定のテスト用の軌跡（画面の座標：x は右向き、y は下向き）。
 */

type Options = { scale?: number; offsetX?: number; offsetY?: number; steps?: number; jitter?: number };

function sample(fn: (u: number) => { x: number; y: number }, opts: Options = {}): Point[] {
  const { scale = 100, offsetX = 400, offsetY = 300, steps = 80, jitter = 0 } = opts;
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647 - 0.5) * 2;
  };
  return Array.from({ length: steps + 1 }, (_, k) => {
    const { x, y } = fn(k / steps);
    return {
      x: offsetX + x * scale + rand() * jitter,
      y: offsetY + y * scale + rand() * jitter,
      t: k * 16,
    };
  });
}

/**
 * 一筆の「α」：右上から書き始め、左側に左回りの輪を描いて交差し、右下へ抜ける。
 * 結節点のある3次曲線 x = s²−1, y = s(s²−1) を、見た目が「α」になるよう y を反転して使う。
 */
export function alphaStroke(opts: Options = {}): Point[] {
  return sample((u) => {
    const s = -1.5 + 3 * u;
    return { x: s * s - 1, y: -(s * (s * s - 1)) };
  }, opts);
}

/** 左右を反転した「α」（輪が右回り）。 */
export function mirroredAlphaStroke(opts: Options = {}): Point[] {
  return alphaStroke(opts).map((p) => ({ ...p, x: 2 * (opts.offsetX ?? 400) - p.x }));
}

/** ぐるぐる：輪が3つ続く（交差が2回以上）。 */
export function scribbleStroke(opts: Options = {}): Point[] {
  return sample((u) => {
    const theta = u * 6 * Math.PI;
    return { x: Math.cos(theta) * 0.6 + theta * 0.12, y: Math.sin(theta) * 0.6 };
  }, { steps: 160, ...opts });
}

/** 渦巻き（交差なし）。 */
export function spiralStroke(opts: Options = {}): Point[] {
  return sample((u) => {
    const theta = u * 6 * Math.PI;
    const r = 0.1 + theta * 0.05;
    return { x: Math.cos(theta) * r, y: Math.sin(theta) * r };
  }, { steps: 160, ...opts });
}

/** ほぼ閉じた円（始点と終点が近い）。 */
export function circleStroke(opts: Options = {}): Point[] {
  return sample((u) => {
    const theta = u * (2 * Math.PI + 0.2);
    return { x: Math.cos(theta), y: Math.sin(theta) };
  }, opts);
}

/** 直線（なでる）。 */
export function lineStroke(opts: Options = {}): Point[] {
  return sample((u) => ({ x: -1.5 + 3 * u, y: 0.4 * u }), opts);
}

/** ジグザグ（なぞる）。 */
export function zigzagStroke(opts: Options = {}): Point[] {
  return sample((u) => ({ x: -1.5 + 3 * u, y: ((Math.floor(u * 8) % 2 === 0 ? u * 8 % 1 : 1 - (u * 8 % 1)) - 0.5) * 0.6 }), opts);
}

/** たたく（ほとんど動かない）。 */
export function tapStroke(): Point[] {
  return [
    { x: 300, y: 300, t: 0 },
    { x: 301, y: 300, t: 16 },
    { x: 301, y: 301, t: 32 },
  ];
}
