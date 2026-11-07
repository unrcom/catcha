/**
 * 小鳥を Rive で描く表示（FR2.9）。Skia の画面の上に重ね、世界の小鳥の位置に 1 羽ずつ Rive の表示を置く。
 * - `EXPO_PUBLIC_BIRD_RIVE=1` で、かつ Rive のファイル（birdRiveAsset.ts の BIRD_RIVE_SOURCE）があるときだけ使う
 * - Rive が再生を始めたら（onPlay）、小鳥を Skia で描くのをやめてもらう（onDrawingChange(true)）。それまでは Rive を見せない
 * - ファイルがない・読み込めない（onError）・決まった時間までに再生が始まらないときは、何も出さず、小鳥は Skia で描く
 * - rive-react-native は、切り替えがオンでファイルもあるときに初めて読み込む（R-02）。切り替えがオフなら一度も読まないので、
 *   Rive のネイティブの部品に問題があってもアプリの起動には響かない。読み込みに失敗したときも、小鳥は Skia で描く
 *
 * 遊び画面（PlayField）は、定義に Overlay がある種類にこの表示を重ねるだけで、小鳥のことは知らない（FR1.4）。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedReaction, useAnimatedStyle, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import type { RNRiveError } from 'rive-react-native';
import { scheduleOnRN } from 'react-native-worklets';

import { birdPose, type BirdPose, type BirdState } from '../behaviors/birdHop';
import type { OverlayProps, World } from '../types';
import { BIRD_RIVE_SOURCE } from './birdRiveAsset';

/** Rive の表示 1 つの大きさ（大きさ 1 のとき。Skia の小鳥と同じくらいに見えるように） */
export const BIRD_RIVE_BOX = 64;
/** この時間までに再生が始まらなければ、Rive は使えないとみなして Skia で描く */
export const BIRD_RIVE_START_TIMEOUT_MS = 3_000;

export type BirdRiveSource = number | { uri: string };

/** rive-react-native の中身（使う時だけ読み込む） */
export type RiveModule = typeof import('rive-react-native');
export type LoadRive = () => RiveModule;

/** rive-react-native を読み込む。起動時ではなく、Rive の小鳥を初めて出すときに呼ぶ。 */
const requireRive: LoadRive = () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('rive-react-native') as RiveModule;

export type BirdRiveOptions = {
  /** Rive で描くか（開発用の切り替え。EXPO_PUBLIC_BIRD_RIVE=1） */
  enabled: boolean;
  /** Rive のファイル。ないときは null */
  source: BirdRiveSource | null;
  startTimeoutMs?: number;
  /** rive-react-native の読み込み方（テストで失敗を起こせるように渡せる） */
  loadRive?: LoadRive;
};

const HIDDEN_POSE: BirdPose = { visible: false, x: 0, y: 0, dir: 1, size: 1, lift: 0, flying: false };

/** 世界の中の、その種類の小鳥の数。 */
function countBirds(world: World | null, kind: string): number {
  'worklet';
  if (!world) return 0;
  return world.agents.filter((a) => a.kind === kind).length;
}

/** 世界の中の、その種類の小鳥の姿（世界の並び順）。 */
export function birdPosesOf(world: World | null, kind: string, now: number): BirdPose[] {
  'worklet';
  if (!world) return [];
  return world.agents.filter((a) => a.kind === kind).map((a) => birdPose(a.state as BirdState, now));
}

type SpriteProps = {
  index: number;
  poses: SharedValue<BirdPose[]>;
  source: BirdRiveSource;
  rive: RiveModule;
  onPlay: () => void;
  onError: (error: RNRiveError) => void;
};

/** 小鳥 1 羽分の Rive の表示。位置は UI スレッドで毎フレーム動かす。 */
function BirdRiveSprite({ index, poses, source, rive, onPlay, onError }: SpriteProps) {
  const { default: Rive, Fit, Alignment } = rive;
  const style = useAnimatedStyle(() => {
    const pose = poses.value[index] ?? HIDDEN_POSE;
    const box = BIRD_RIVE_BOX * pose.size;
    return {
      opacity: pose.visible ? 1 : 0,
      width: box,
      height: box,
      transform: [
        { translateX: pose.x - box / 2 },
        { translateY: pose.y - box / 2 - pose.lift * 10 * pose.size },
        { scaleX: pose.dir },
      ],
    };
  });
  return (
    <Animated.View style={[styles.sprite, style]}>
      <Rive
        source={source}
        fit={Fit.Contain}
        alignment={Alignment.Center}
        autoplay
        style={styles.fill}
        onPlay={onPlay}
        onError={onError}
        testID={`bird-rive-${index}`}
      />
    </Animated.View>
  );
}

type LayerProps = OverlayProps & { source: BirdRiveSource; rive: RiveModule; startTimeoutMs: number };

/** Rive の小鳥を重ねる層。読み込めないとわかったら何も出さない。 */
function BirdRiveLayer({ world, kind, onDrawingChange, source, rive, startTimeoutMs }: LayerProps) {
  // 小鳥の数は、世界ができたとき（獲物の数が変わったとき）だけ変わる
  const [slots, setSlots] = useState(() => countBirds(world.value, kind));
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const drawingRef = useRef(false);
  const poses = useSharedValue<BirdPose[]>([]);

  useAnimatedReaction(
    () => countBirds(world.value, kind),
    (n, prev) => {
      if (n !== prev) scheduleOnRN(setSlots, n);
    },
  );

  useFrameCallback(() => {
    'worklet';
    poses.value = birdPosesOf(world.value, kind, Date.now());
  });

  const giveUp = useCallback(
    (reason: string, error?: unknown) => {
      console.warn(`[rive] the bird is drawn with Skia instead: ${reason}`, error ?? '');
      setFailed(true);
      if (drawingRef.current) {
        drawingRef.current = false;
        onDrawingChange(false);
      }
    },
    [onDrawingChange],
  );

  const handlePlay = useCallback(() => {
    setPlaying(true);
    if (drawingRef.current) return;
    drawingRef.current = true;
    onDrawingChange(true);
  }, [onDrawingChange]);

  const handleError = useCallback((error: RNRiveError) => giveUp(`could not load bird.riv (${error.type})`, error.message), [giveUp]);

  // 再生が始まらないまま時間が過ぎたら、動かないとみなす
  useEffect(() => {
    if (playing || failed || slots === 0) return undefined;
    const timer = setTimeout(() => giveUp(`bird.riv did not start playing within ${startTimeoutMs} ms`), startTimeoutMs);
    return () => clearTimeout(timer);
  }, [playing, failed, slots, startTimeoutMs, giveUp]);

  // 表示を外すときは、Skia で描くのに戻す
  useEffect(
    () => () => {
      if (drawingRef.current) {
        drawingRef.current = false;
        onDrawingChange(false);
      }
    },
    [onDrawingChange],
  );

  if (failed) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { opacity: playing ? 1 : 0 }]} pointerEvents="none" testID="bird-rive-layer">
      {Array.from({ length: slots }, (_, i) => (
        <BirdRiveSprite key={i} index={i} poses={poses} source={source} rive={rive} onPlay={handlePlay} onError={handleError} />
      ))}
    </View>
  );
}

/**
 * Rive の小鳥の表示を作る。使わない・使えないときは何も出さない表示になる（小鳥は Skia で描かれたまま）。
 * テストで切り替えとファイルを渡せるよう、作る関数にしている。
 */
export function createBirdRiveOverlay({
  enabled,
  source,
  startTimeoutMs = BIRD_RIVE_START_TIMEOUT_MS,
  loadRive = requireRive,
}: BirdRiveOptions) {
  let warnedMissing = false;
  /** 読み込んだ rive-react-native。undefined はまだ読んでいない、null は読めなかった */
  let rive: RiveModule | null | undefined;

  function getRive(): RiveModule | null {
    if (rive !== undefined) return rive;
    try {
      const loaded = loadRive();
      if (typeof loaded?.default !== 'function' && typeof loaded?.default !== 'object') {
        throw new Error('rive-react-native has no Rive component');
      }
      rive = loaded;
    } catch (error) {
      console.warn('[rive] could not load rive-react-native; the bird is drawn with Skia', error);
      rive = null;
    }
    return rive;
  }

  function BirdRiveOverlay(props: OverlayProps) {
    if (!enabled) return null;
    if (source === null) {
      if (!warnedMissing) console.warn('[rive] EXPO_PUBLIC_BIRD_RIVE=1 but assets/rive/bird.riv is not set; the bird is drawn with Skia');
      warnedMissing = true;
      return null;
    }
    const loaded = getRive();
    if (loaded === null) return null;
    return <BirdRiveLayer {...props} source={source} rive={loaded} startTimeoutMs={startTimeoutMs} />;
  }
  return BirdRiveOverlay;
}

/** 開発用の切り替え。ビルドのときに EXPO_PUBLIC_BIRD_RIVE=1 なら Rive で描いてみる */
const BIRD_RIVE_ON = process.env.EXPO_PUBLIC_BIRD_RIVE === '1';

export const BirdRive = createBirdRiveOverlay({ enabled: BIRD_RIVE_ON, source: BIRD_RIVE_SOURCE });

const styles = StyleSheet.create({
  sprite: { position: 'absolute', left: 0, top: 0 },
  fill: { width: '100%', height: '100%' },
});
