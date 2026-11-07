/**
 * 遊び場（interaction-spec.md の PlayField。FR2.1〜FR2.6。v0.1 で FR3.1・FR4.1・FR5.1 の作りに替えた）
 * - 獲物は一体ずつのエージェント（src/prey/world.ts）。獲物の数は設定から受け取り、種類を同じ数ずつ混ぜる
 * - 世界は reanimated の useFrameCallback で UI スレッドで進め、Skia の Picture をそのフレームの中で描き直す
 *   （毎フレームの React の再描画をしない）
 * - 触られた獲物は「捕まえた」で止まってから逃げる。何もない所に触っても何も起きない（当たり判定も UI スレッド）
 * - 複数の指を別々に扱う。ボタンや文字は出さない（開発用の計測表示は EXPO_PUBLIC_FPS_METER=1 のときだけ）
 * - 指が離れたら、その指の軌跡（「α」かどうか）を親に渡す（今のまま JS 側）
 * - 獲物の種類ごとの情報は src/prey/kinds/index.ts の定義だけから引く。種類を足しても、このファイルは書き換えない（FR1.4）
 */
import { Canvas, createPicture, Picture, type SkPicture } from '@shopify/react-native-skia';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import type { Point, StrokeEnd } from '../domain/alphaGesture';
import { DEFAULT_SETTINGS, type Background } from '../data/settingsStore';
import { FpsMeter } from '../prey/FpsMeter';
import { PREY_KINDS } from '../prey/kinds';
import { drawWorld } from '../prey/render/drawWorld';
import type { Field, SoundCue, TouchResult, World } from '../prey/types';
import { createWorld, pointWorld, stepWorld, touchWorld } from '../prey/world';
import { TABLET_MIN_SIDE, toyPalette } from './theme';
import { TouchSurface } from './TouchSurface';
import { useToySounds } from './useToySounds';

type Props = {
  background: Background;
  soundOn: boolean;
  /** 遊び画面に出す獲物の数（設定の値。FR5.1） */
  preyCount?: number;
  onStrokeEnd: (stroke: StrokeEnd) => void;
  onActiveCountChange?: (count: number) => void;
  /** 飼い主メニューを開いている間は、読み上げの対象から外す */
  hiddenFromAccessibility?: boolean;
};

/** 開発用のコマ数の計測表示（NFR1）。ビルドのときに EXPO_PUBLIC_FPS_METER=1 なら出す */
const FPS_METER_ON = process.env.EXPO_PUBLIC_FPS_METER === '1';

/** Skia の上に重ねて描く表示（Rive など）を持つ種類。定義から作る（種類を足しても、ここは書き換えない） */
const OVERLAY_KINDS = PREY_KINDS.filter((k) => k.Overlay);

/** 指の方を見る獲物（動きの部品に watch がある種類）がいるか。いなければ、指を動かした位置は送らない */
const WATCHES_POINTER = PREY_KINDS.some((k) => k.behavior.watch);
/** 指を動かした位置を UI スレッドへ送る間隔（ミリ秒） */
const MOVE_SEND_GAP_MS = 32;

const EMPTY_PICTURE: SkPicture = createPicture(() => undefined);

export function PlayField({
  background,
  soundOn,
  preyCount = DEFAULT_SETTINGS.preyCount,
  onStrokeEnd,
  onActiveCountChange,
  hiddenFromAccessibility = false,
}: Props) {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= TABLET_MIN_SIDE;
  const palette = toyPalette(background);
  const sounds = useToySounds(soundOn);

  const field = useSharedValue<Field>({ width, height });
  const colors = useSharedValue(palette);
  const world = useSharedValue<World | null>(null);
  const picture = useSharedValue<SkPicture>(EMPTY_PICTURE);
  /** 重ねた表示で描いているので、Skia では描かない種類 */
  const skipKinds = useSharedValue<string[]>([]);

  useEffect(() => {
    field.value = { width, height };
  }, [field, width, height]);

  useEffect(() => {
    colors.value = toyPalette(background);
  }, [colors, background]);

  // 獲物の世界は、遊び画面を開いたとき（と、獲物の数が変わったとき）に作る。画面の大きさは作った時点のもの
  const sizeAtStart = useRef({ width, height, isTablet });
  useEffect(() => {
    const { width: w, height: h, isTablet: tablet } = sizeAtStart.current;
    world.value = createWorld({ count: preyCount, field: { width: w, height: h }, isTablet: tablet, now: Date.now() });
  }, [world, preyCount]);

  // 音は JS 側で鳴らす（UI スレッドからは合図だけを渡す）
  const soundsRef = useRef(sounds);
  soundsRef.current = sounds;
  const playCues = useCallback((cues: SoundCue[]) => {
    cues.forEach((c) => soundsRef.current.play(c.kind, c.cue));
  }, []);
  const playTouch = useCallback((result: TouchResult) => {
    if (result.hit) soundsRef.current.playStartle();
    result.cues.forEach((c) => soundsRef.current.play(c.kind, c.cue));
  }, []);

  useFrameCallback(() => {
    'worklet';
    // 世界は UI スレッドのこの値の中で書き換える（毎フレーム React に渡さない）
    const w = world.value;
    if (!w) return;
    const now = Date.now();
    const cues = stepWorld(w, field.value, now);
    picture.value = drawWorld(w, colors.value, now, skipKinds.value);
    if (cues.length > 0) scheduleOnRN(playCues, cues);
  });

  function handleTouchDown(p: Point) {
    // 当たり判定・「捕まえた」・逃げる・波紋は UI スレッドの世界で行い、音を鳴らすかどうかだけを返してもらう
    scheduleOnUI(
      (x: number, y: number) => {
        'worklet';
        const w = world.value;
        if (!w) return;
        const result = touchWorld(w, { x, y }, field.value, Date.now());
        if (result.hit || result.cues.length > 0) scheduleOnRN(playTouch, result);
      },
      p.x,
      p.y,
    );
  }

  // 指を動かした位置を覚える（指の方を見る獲物のため）。動かすたびに UI スレッドへ送らないよう、間を空ける
  const lastMoveSent = useRef(0);
  function handleTouchMove(p: Point) {
    if (!WATCHES_POINTER || p.t - lastMoveSent.current < MOVE_SEND_GAP_MS) return;
    lastMoveSent.current = p.t;
    scheduleOnUI(
      (x: number, y: number, t: number) => {
        'worklet';
        const w = world.value;
        if (w) pointWorld(w, { x, y }, t);
      },
      p.x,
      p.y,
      p.t,
    );
  }

  const overlayHandlers = useMemo(
    () =>
      Object.fromEntries(
        OVERLAY_KINDS.map((k) => [
          k.id,
          (drawsKind: boolean) => {
            const others = skipKinds.value.filter((id) => id !== k.id);
            skipKinds.value = drawsKind ? [...others, k.id] : others;
          },
        ]),
      ),
    [skipKinds],
  );

  return (
    <TouchSurface
      style={[StyleSheet.absoluteFill, { backgroundColor: palette.background }]}
      onTouchDown={handleTouchDown}
      onTouchMove={handleTouchMove}
      onStrokeEnd={onStrokeEnd}
      onActiveCountChange={onActiveCountChange}
      hiddenFromAccessibility={hiddenFromAccessibility}
      testID="play-field"
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Canvas style={StyleSheet.absoluteFill}>
          <Picture picture={picture} />
        </Canvas>
        {OVERLAY_KINDS.map((k) => {
          const Overlay = k.Overlay!;
          return <Overlay key={k.id} world={world} kind={k.id} onDrawingChange={overlayHandlers[k.id]} />;
        })}
      </View>
      {FPS_METER_ON ? <FpsMeter preyCount={preyCount} /> : null}
    </TouchSurface>
  );
}
