/**
 * 「α」の判定（FR3.1, FR3.4。interaction-spec.md の AlphaGesture）。
 *
 * - 触れている指を1本ずつ別々に追い、指が離れたときにその指の軌跡だけで判定する。
 *   どれか1本が「α」なら認識する。指どうしの軌跡は混ぜない。
 * - 「α」とみなす形（一筆）：
 *     1. 自分自身との交差がちょうど1回（輪が1つ。ぐるぐるは交差が2回以上、直線・ジグザグは0回）
 *     2. 交差で区切られた輪の部分が、見た目で左回り（反時計回り）
 *     3. 輪の前後にしっぽ（書き始めと書き終わりの線）があり、始点と終点が離れている
 * - 大きさは問わない（軌跡を同じ間隔の点に並べ直してから判定するので、大きさに左右されない）。
 *
 * 数値の閾値は実機での合格基準（飼い主10回中8回以上、ネコ10分×3回で0回）を見て調整する。
 */

export type Point = { x: number; y: number; t: number };

export type AlphaOptions = {
  /** 認識する最小の大きさ（外接矩形の対角線の長さ、pt）。0 は大きさを問わない。 */
  minSize?: number;
};

export const ALPHA_RESAMPLE_POINTS = 64;
/** 輪の部分が軌跡全体に占める長さの割合の下限 */
const MIN_LOOP_FRACTION = 0.3;
/** しっぽ（輪の前・後）がそれぞれ軌跡全体に占める長さの割合の下限 */
const MIN_TAIL_FRACTION = 0.04;
/** 始点と終点の距離の、外接矩形の対角線に対する割合の下限 */
const MIN_END_SEPARATION = 0.25;
/** 判定に使う生の点の数の下限（タップや短い動きを除く） */
const MIN_RAW_POINTS = 8;

type XY = { x: number; y: number };

function distance(a: XY, b: XY): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pathLength(points: readonly XY[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1], points[i]);
  return total;
}

/** 軌跡を、同じ間隔の n 個の点に並べ直す。 */
export function resample(points: readonly XY[], n: number = ALPHA_RESAMPLE_POINTS): XY[] {
  const total = pathLength(points);
  if (points.length < 2 || total === 0) return [];
  const step = total / (n - 1);
  const out: XY[] = [{ x: points[0].x, y: points[0].y }];
  let carried = 0;
  for (let i = 1; i < points.length && out.length < n; i += 1) {
    let prev: XY = points[i - 1];
    const curr = points[i];
    let seg = distance(prev, curr);
    while (carried + seg >= step && out.length < n) {
      const ratio = (step - carried) / seg;
      const p = { x: prev.x + (curr.x - prev.x) * ratio, y: prev.y + (curr.y - prev.y) * ratio };
      out.push(p);
      prev = p;
      seg = distance(prev, curr);
      carried = 0;
    }
    carried += seg;
  }
  while (out.length < n) out.push({ ...points[points.length - 1] });
  return out;
}

function cross(o: XY, a: XY, b: XY): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function segmentsIntersect(p1: XY, p2: XY, p3: XY, p4: XY): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** 自分自身との交差を、[前の線分の番号, 後の線分の番号] の組で返す。 */
export function selfIntersections(points: readonly XY[]): Array<[number, number]> {
  const found: Array<[number, number]> = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    for (let j = i + 2; j < points.length - 1; j += 1) {
      if (segmentsIntersect(points[i], points[i + 1], points[j], points[j + 1])) found.push([i, j]);
    }
  }
  return found;
}

/**
 * 見た目での向き付きの面積。画面の座標は y が下向きなので、y を反転して計算する。
 * 正なら見た目で左回り（反時計回り）。
 */
export function visualSignedArea(points: readonly XY[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * -b.y - b.x * -a.y;
  }
  return sum / 2;
}

/** 1本の指の軌跡が一筆の「α」かどうか。 */
export function isAlphaStroke(raw: readonly XY[], options: AlphaOptions = {}): boolean {
  if (raw.length < MIN_RAW_POINTS) return false;
  const xs = raw.map((p) => p.x);
  const ys = raw.map((p) => p.y);
  const diagonal = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (diagonal === 0 || diagonal < (options.minSize ?? 0)) return false;

  const pts = resample(raw);
  if (pts.length < ALPHA_RESAMPLE_POINTS) return false;
  const crossings = selfIntersections(pts);
  if (crossings.length !== 1) return false;

  const [i, j] = crossings[0];
  const segments = pts.length - 1;
  const loopFraction = (j - i) / segments;
  const headFraction = i / segments;
  const tailFraction = (segments - (j + 1)) / segments;
  if (loopFraction < MIN_LOOP_FRACTION) return false;
  if (headFraction < MIN_TAIL_FRACTION || tailFraction < MIN_TAIL_FRACTION) return false;

  const loop = pts.slice(i + 1, j + 1);
  if (visualSignedArea(loop) <= 0) return false;

  return distance(pts[0], pts[pts.length - 1]) >= MIN_END_SEPARATION * diagonal;
}

export type StrokeEnd = { id: string; points: Point[]; isAlpha: boolean };

/**
 * 触れている指を1本ずつ追う。指が離れると、その指の軌跡と「α」かどうかを返す。
 */
export class StrokeTracker {
  private readonly strokes = new Map<string, Point[]>();

  constructor(private readonly options: AlphaOptions = {}) {}

  begin(id: string, p: Point): void {
    this.strokes.set(id, [p]);
  }

  move(id: string, p: Point): void {
    const stroke = this.strokes.get(id);
    if (!stroke) return;
    const last = stroke[stroke.length - 1];
    if (last.x !== p.x || last.y !== p.y) stroke.push(p);
  }

  /** 指が離れた。追っていない指なら null。 */
  end(id: string, p: Point): StrokeEnd | null {
    const stroke = this.strokes.get(id);
    if (!stroke) return null;
    this.move(id, p);
    this.strokes.delete(id);
    return { id, points: stroke, isAlpha: isAlphaStroke(stroke, this.options) };
  }

  /** 触れたままの指の数。 */
  get activeCount(): number {
    return this.strokes.size;
  }

  reset(): void {
    this.strokes.clear();
  }
}
