import { isAlphaStroke, StrokeTracker, type Point } from '../../src/domain/alphaGesture';
import {
  alphaStroke,
  circleStroke,
  lineStroke,
  mirroredAlphaStroke,
  scribbleStroke,
  spiralStroke,
  tapStroke,
  zigzagStroke,
} from '../fixtures/strokes';

describe('isAlphaStroke (FR3.1, FR3.4)', () => {
  it('recognizes a one-stroke α', () => {
    expect(isAlphaStroke(alphaStroke())).toBe(true);
  });

  it('recognizes an α of any size and with a slightly shaky hand', () => {
    expect(isAlphaStroke(alphaStroke({ scale: 8 }))).toBe(true); // 小さい
    expect(isAlphaStroke(alphaStroke({ scale: 400 }))).toBe(true); // 大きい
    expect(isAlphaStroke(alphaStroke({ jitter: 4 }))).toBe(true); // 少し震える
  });

  it.each([
    ['ぐるぐる（輪が3つ）', scribbleStroke()],
    ['渦巻き', spiralStroke()],
    ['ほぼ閉じた円', circleStroke()],
    ['直線（なでる）', lineStroke()],
    ['ジグザグ（なぞる）', zigzagStroke()],
    ['たたく', tapStroke()],
    ['左右反転した α（右回りの輪）', mirroredAlphaStroke()],
  ])('does not recognize %s', (_name, stroke) => {
    expect(isAlphaStroke(stroke)).toBe(false);
  });

  it('honours an explicit minimum size when one is set', () => {
    expect(isAlphaStroke(alphaStroke({ scale: 8 }), { minSize: 100 })).toBe(false);
  });
});

function feed(tracker: StrokeTracker, id: string, points: Point[]) {
  tracker.begin(id, points[0]);
  points.slice(1, -1).forEach((p) => tracker.move(id, p));
  return () => tracker.end(id, points[points.length - 1]);
}

describe('StrokeTracker (each finger judged separately)', () => {
  it('recognizes α when one of two simultaneous fingers draws it (FR3.1)', () => {
    const tracker = new StrokeTracker();
    const endPaw = feed(tracker, 'paw', lineStroke({ offsetX: 200 }));
    const endOwner = feed(tracker, 'owner', alphaStroke({ offsetX: 600 }));
    expect(tracker.activeCount).toBe(2);

    expect(endPaw()?.isAlpha).toBe(false);
    expect(endOwner()?.isAlpha).toBe(true);
    expect(tracker.activeCount).toBe(0);
  });

  it('does not mix the points of interleaved fingers', () => {
    const tracker = new StrokeTracker();
    const alpha = alphaStroke();
    const paw = zigzagStroke({ offsetX: 100 });
    tracker.begin('a', alpha[0]);
    tracker.begin('b', paw[0]);
    for (let k = 1; k < alpha.length - 1; k += 1) {
      tracker.move('a', alpha[k]);
      if (paw[k]) tracker.move('b', paw[k]);
    }
    expect(tracker.end('a', alpha[alpha.length - 1])?.isAlpha).toBe(true);
    expect(tracker.end('b', paw[paw.length - 1])?.isAlpha).toBe(false);
  });

  it('ignores the end of a finger it never saw begin', () => {
    expect(new StrokeTracker().end('ghost', { x: 0, y: 0, t: 0 })).toBeNull();
  });
});
