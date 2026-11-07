/**
 * 獲物の世界の型（v0.1。FR1.1・FR1.2）。
 * - 獲物は一体ずつ「エージェント」になり、自分の種類（kind）と、その種類の動きの部品が持つ状態を持つ
 * - 動きの部品（Behavior）は状態の切り替え（隠れている・動いている・捕まって止まっている・逃げている）を中で行う
 * - 獲物の種類は 1 つの定義（PreyKind。データ）で表し、一覧は src/prey/kinds/index.ts の 1 か所にまとめる
 *
 * 世界は UI スレッド（reanimated の useFrameCallback）で進めるので、動きの部品と描き方の関数は
 * すべて 'worklet' にする。
 */
import type { SkCanvas, SkPaint } from '@shopify/react-native-skia';
import type { AudioSource } from 'expo-audio';
import type { ComponentType } from 'react';
import type { SharedValue } from 'react-native-reanimated';

export type Vec = { x: number; y: number };
export type Field = { width: number; height: number };
export type Rand = () => number;

/** 鳴らす音の合図。種類（kind）の定義の sounds にある名前（cue）で鳴らす。 */
export type SoundCue = { kind: string; cue: string };

/**
 * 何も見えない時間が続いたときに、隠れている獲物を呼び戻す順番。
 * 段（tier）の小さいものから選び、同じ段の中では order の小さいものを選ぶ。
 * 今の順番（猫じゃらし → 紐・しっぽ → ネズミ → 画面の外を通っている紐・しっぽ）を段で表す。
 */
export const RECALL_TIER = {
  /** 下から伸びてすぐ見える（猫じゃらし） */
  popUp: 0,
  /** 端から入ってくる（紐・しっぽ） */
  enter: 1,
  /** 端から現れる（ネズミ） */
  appear: 2,
  /** 画面の外を通っているものを、画面の中心へ向け直す */
  redirect: 3,
} as const;

export type RecallRank = { tier: number; order: number };

/** 獲物を 1 匹作るときに渡すもの。 */
export type CreateContext = {
  field: Field;
  isTablet: boolean;
  /** 大きさの倍率（定義の size から、タブレットかスマートフォンかで選んだ値） */
  scale: number;
  now: number;
  rand: Rand;
  /** 世界の中で何番目に作られたか（種類を順に回した順番）。登場の時刻をずらすのに使う */
  order: number;
};

/**
 * 動きの部品。S はその部品が 1 匹ごとに持つ状態。すべて 'worklet' で書く。
 * 合図（cue）は、定義の sounds にある音の名前。鳴らさないときは null。
 */
export type Behavior<S> = {
  create(ctx: CreateContext): S;
  /** dt 秒進める */
  step(state: S, field: Field, now: number, dt: number, rand: Rand): string | null;
  /** 当たり範囲の中に触れられた（「捕まえた」で止まってから逃げる） */
  startle(state: S, from: Vec, field: Field, now: number, rand: Rand): string | null;
  /** 当たっていない所に触れられた（近くの指に気づいて逃げる獲物のため。なくてもよい） */
  react?(state: S, from: Vec, field: Field, now: number, rand: Rand): string | null;
  /** 体のどこかが画面の中に見えているか */
  isOnScreen(state: S, field: Field): boolean;
  /** 描くか（隠れているものは描かず、触っても当たらない） */
  isVisible(state: S): boolean;
  /** 点から体までのいちばん近い距離（隠れているときは Infinity） */
  distanceTo(state: S, p: Vec): number;
  hitRadius(state: S): number;
  /** 呼び戻せるなら順番、呼び戻せないなら null */
  recallRank(state: S, now: number): RecallRank | null;
  /** 呼び戻す */
  recall(state: S, field: Field, now: number): void;
};

/** 描くときに渡すもの。筆（paint）はフレームごとに作り、獲物どうしで使い回す。 */
export type DrawContext = {
  color: string;
  outline: string | null;
  now: number;
  stroke: SkPaint;
  fill: SkPaint;
};

/** 獲物 1 匹を Skia で描く関数（'worklet'）。 */
export type Render<S> = (canvas: SkCanvas, state: S, ctx: DrawContext) => void;

/** 1 つの音。sources が 2 つ以上なら順番に鳴らす（ネズミの「テ」「ケ」）。 */
export type PreySound = { sources: AudioSource[]; minGapMs: number };

/** 色の番号。数は遊び画面の色（toyPalette の toys）の何番目か、'mouse' はネズミの色。 */
export type PreyColor = number | 'mouse';

/** 世界の上に重ねて描く表示（Rive など）に渡すもの。 */
export type OverlayProps = {
  world: SharedValue<World | null>;
  kind: string;
  /** true にすると、その種類を Skia では描かない（重ねた表示で描く）。描けなくなったら false に戻す */
  onDrawingChange: (drawsKind: boolean) => void;
};

/** 獲物の種類の定義（データ）。FR1.2 */
export type PreyKind<S = unknown> = {
  id: string;
  /** 設定の画面に出す名前 */
  label: string;
  behavior: Behavior<S>;
  render: Render<S>;
  /** 合図の名前 → 音 */
  sounds: Record<string, PreySound>;
  /** 大きさの倍率（タブレット・スマートフォン） */
  size: { tablet: number; phone: number };
  color: PreyColor;
  /** Skia の上に重ねて描く表示（なければ Skia だけで描く） */
  Overlay?: ComponentType<OverlayProps>;
};

/** 獲物 1 匹。state の中身は種類の動きの部品が決める。 */
export type Agent = { id: number; kind: string; state: unknown };

/** ネコが当てた場所に広がる波紋。 */
export type Ripple = { x: number; y: number; start: number; color: PreyColor };

/** 遊び画面のすべての獲物と波紋。 */
export type World = {
  agents: Agent[];
  ripples: Ripple[];
  /** 画面に何も見えなくなった時刻。見えている間は null */
  emptySince: number | null;
  /** 前のフレームの時刻 */
  lastNow: number;
};

/** 触ったときの結果。hit は当たり範囲の中のものがあったか（「捕まえた」の音を鳴らす）。 */
export type TouchResult = { hit: boolean; cues: SoundCue[] };
