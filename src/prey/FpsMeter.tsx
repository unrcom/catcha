/**
 * 開発用のコマ数の計測表示（NFR1）。EXPO_PUBLIC_FPS_METER=1 のときだけ遊び画面に出す（PlayField が決める）。
 * UI スレッドのコマの間隔を数え、1 秒ごとのコマ数と、30 秒の平均のコマ数を画面の隅に出す。
 * 30 秒の平均はログにも出す（実機で 30 匹・50 匹のそれぞれを 30 秒測り、平均 58 コマ以上なら合格）。
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** 平均を出す長さ */
export const FPS_WINDOW_MS = 30_000;
const SECOND_MS = 1_000;

type Counter = { windowStart: number; windowFrames: number; secondStart: number; secondFrames: number; lastAverage: number };

/** 数えたコマから 1 秒あたりのコマ数を出す。 */
export function framesPerSecond(frames: number, elapsedMs: number): number {
  'worklet';
  return elapsedMs > 0 ? (frames * SECOND_MS) / elapsedMs : 0;
}

export function FpsMeter({ preyCount }: { preyCount: number }) {
  const [text, setText] = useState('-- fps');
  const counter = useSharedValue<Counter>({ windowStart: -1, windowFrames: 0, secondStart: -1, secondFrames: 0, lastAverage: -1 });

  const report = useCallback(
    (current: number, average: number, windowDone: boolean) => {
      const avg = average >= 0 ? `${average.toFixed(1)}` : '--';
      setText(`${current.toFixed(0)} fps / 30秒平均 ${avg}（${preyCount}匹）`);
      if (windowDone) console.log(`[fps] UI thread 30s average ${average.toFixed(1)} fps (${preyCount} prey)`);
    },
    [preyCount],
  );

  useFrameCallback((frame) => {
    'worklet';
    const t = frame.timestamp;
    // 数える値は UI スレッドのこの値の中で書き換える（毎フレーム React に渡さない）
    const c = counter.value;
    if (c.windowStart < 0) {
      c.windowStart = t;
      c.secondStart = t;
      return;
    }
    c.windowFrames += 1;
    c.secondFrames += 1;
    if (t - c.secondStart < SECOND_MS) return;
    const current = framesPerSecond(c.secondFrames, t - c.secondStart);
    c.secondStart = t;
    c.secondFrames = 0;
    let windowDone = false;
    if (t - c.windowStart >= FPS_WINDOW_MS) {
      c.lastAverage = framesPerSecond(c.windowFrames, t - c.windowStart);
      c.windowStart = t;
      c.windowFrames = 0;
      windowDone = true;
    }
    scheduleOnRN(report, current, c.lastAverage, windowDone);
  });

  return (
    <View style={styles.box} pointerEvents="none" testID="fps-meter">
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', top: 8, left: 8, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: 'rgba(0, 0, 0, 0.6)', borderRadius: 4 },
  text: { color: '#7CFC00', fontSize: 12, fontVariant: ['tabular-nums'] },
});
