import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import type { Point, StrokeEnd } from '../../src/domain/alphaGesture';
import { makeMoveGate, MOVE_SEND_GAP_MS } from '../../src/ui/PlayField';
import { TouchSurface } from '../../src/ui/TouchSurface';
import { alphaStroke, lineStroke } from '../fixtures/strokes';

/** 実機のように 16 ミリ秒ごとに指を動かす（TouchSurface は時刻を Date.now() で付ける） */
async function drawSlowly(el: Parameters<typeof fireEvent>[0], points: Point[], identifier = 1) {
  const touch = (p: Point) => ({ nativeEvent: { changedTouches: [{ identifier, pageX: p.x, pageY: p.y }] } });
  await fireEvent(el, 'touchStart', touch(points[0]));
  for (const p of points.slice(1, -1)) {
    await act(async () => {
      jest.advanceTimersByTime(16);
    });
    await fireEvent(el, 'touchMove', touch(p));
  }
  await fireEvent(el, 'touchEnd', touch(points[points.length - 1]));
}

async function strokesOf(points: Point[], withMove: boolean) {
  const ends: StrokeEnd[] = [];
  const moves: Point[] = [];
  const view = await render(
    <TouchSurface testID="surface" onStrokeEnd={(s) => ends.push(s)} onTouchMove={withMove ? (p) => moves.push(p) : undefined} />,
  );
  await drawSlowly(view.getByTestId('surface'), points);
  await view.unmount();
  return { ends, moves };
}

beforeEach(() => {
  jest.useFakeTimers({ now: 1_000_000 });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('指の動きを知らせても「α」の判定は変わらない (FR4.1, FR2.10)', () => {
  it('gives the same α result and the same points with or without onTouchMove', async () => {
    const without = await strokesOf(alphaStroke(), false);
    jest.setSystemTime(1_000_000);
    const withMove = await strokesOf(alphaStroke(), true);
    expect(without.ends).toHaveLength(1);
    expect(without.ends[0].isAlpha).toBe(true);
    expect(withMove.ends).toEqual(without.ends);
  });

  it('gives the same result for a stroke that is not α', async () => {
    const without = await strokesOf(lineStroke(), false);
    jest.setSystemTime(1_000_000);
    const withMove = await strokesOf(lineStroke(), true);
    expect(without.ends[0].isAlpha).toBe(false);
    expect(withMove.ends).toEqual(without.ends);
  });

  it('tells every move of the finger, with its position and time', async () => {
    const points = alphaStroke();
    const { moves } = await strokesOf(points, true);
    expect(moves).toHaveLength(points.length - 2);
    expect(moves[0]).toEqual({ x: points[1].x, y: points[1].y, t: 1_000_016 });
  });
});

describe('指を動かした位置を送る間隔 (FR2.10)', () => {
  it('sends at most once every 32 ms', () => {
    const send = makeMoveGate(true);
    expect(MOVE_SEND_GAP_MS).toBe(32);
    const sent = [0, 16, 31, 32, 48, 63, 64, 200].filter((t) => send(t));
    expect(sent).toEqual([0, 32, 64, 200]);
  });

  it('sends nothing when no prey watches the finger', () => {
    const send = makeMoveGate(false);
    expect([0, 32, 64, 1_000].some((t) => send(t))).toBe(false);
  });

  it('keeps its own time for each play field', () => {
    const a = makeMoveGate(true);
    const b = makeMoveGate(true);
    expect(a(100)).toBe(true);
    expect(b(110)).toBe(true);
    expect(a(120)).toBe(false);
  });
});
