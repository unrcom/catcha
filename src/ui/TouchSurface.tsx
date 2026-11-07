/**
 * 画面全体のタッチを受け、指ごとの軌跡を StrokeTracker に渡す（遊び画面・結果画面で使う）。
 * 押せる部品ではない（読み上げの操作対象にならない）。FR2.4, FR3.1, FR3.3, FR3.4
 */
import React, { useRef } from 'react';
import { View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

import { StrokeTracker, type Point, type StrokeEnd } from '../domain/alphaGesture';

type Props = {
  onStrokeEnd: (stroke: StrokeEnd) => void;
  onTouchDown?: (point: Point) => void;
  /** 指を動かした（なくてもよい） */
  onTouchMove?: (point: Point) => void;
  onActiveCountChange?: (count: number) => void;
  hiddenFromAccessibility?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: React.ReactNode;
};

type RawTouch = { identifier: number | string; pageX: number; pageY: number };

function touchesOf(e: GestureResponderEvent): RawTouch[] {
  const changed = (e.nativeEvent as unknown as { changedTouches?: RawTouch[] }).changedTouches;
  if (changed && changed.length > 0) return changed;
  const { identifier, pageX, pageY } = e.nativeEvent as unknown as RawTouch;
  return [{ identifier, pageX, pageY }];
}

export function TouchSurface({
  onStrokeEnd,
  onTouchDown,
  onTouchMove,
  onActiveCountChange,
  hiddenFromAccessibility = false,
  style,
  testID,
  children,
}: Props) {
  const tracker = useRef(new StrokeTracker()).current;

  const point = (t: RawTouch): Point => ({ x: t.pageX, y: t.pageY, t: Date.now() });

  function handleStart(e: GestureResponderEvent) {
    for (const t of touchesOf(e)) {
      const p = point(t);
      tracker.begin(String(t.identifier), p);
      onTouchDown?.(p);
    }
    onActiveCountChange?.(tracker.activeCount);
  }

  function handleMove(e: GestureResponderEvent) {
    for (const t of touchesOf(e)) {
      const p = point(t);
      tracker.move(String(t.identifier), p);
      onTouchMove?.(p);
    }
  }

  function handleEnd(e: GestureResponderEvent) {
    for (const t of touchesOf(e)) {
      const stroke = tracker.end(String(t.identifier), point(t));
      if (stroke) onStrokeEnd(stroke);
    }
    onActiveCountChange?.(tracker.activeCount);
  }

  return (
    <View
      style={style}
      testID={testID}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
      onTouchCancel={handleEnd}
      accessible={false}
      importantForAccessibility={hiddenFromAccessibility ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={hiddenFromAccessibility}
    >
      {children}
    </View>
  );
}
