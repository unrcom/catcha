/**
 * 獲物の種類の一覧（FR1.2）。種類の情報はここ 1 か所にまとめる。
 * 新しい種類を足すときは、定義のファイルを作って、この一覧に 1 行足す（遊び画面は書き換えない。FR1.4）。
 * 一覧の順番は、獲物を混ぜる順番（端数は先頭から足す）・描く順番・当たりを調べる順番になる。
 */
import type { Behavior, PreyColor, PreyKind, Render } from '../types';
import { birdKind } from './bird';
import { birdJointKind } from './birdJoint';
import { mouseKind } from './mouse';
import { stringKind } from './string';
import { tailKind } from './tail';
import { teaserKind } from './teaser';

/** 開発用の切り替え。ビルドのときに EXPO_PUBLIC_BIRD_JOINTS=1 なら、小鳥を関節のある小鳥（試し）に入れ替える */
const BIRD_JOINTS_ON = process.env.EXPO_PUBLIC_BIRD_JOINTS === '1';
/** 開発用。EXPO_PUBLIC_BIRD_JOINTS=only なら、関節のある小鳥だけを出す（動きを見る・コマ数を測るため） */
const BIRD_JOINTS_ONLY = process.env.EXPO_PUBLIC_BIRD_JOINTS === 'only';

/* eslint-disable @typescript-eslint/no-explicit-any -- 状態の形は種類ごとに違うので、一覧ではまとめて扱う */
export const PREY_KINDS: readonly PreyKind<any>[] = BIRD_JOINTS_ONLY
  ? [birdJointKind]
  : [stringKind, tailKind, teaserKind, mouseKind, BIRD_JOINTS_ON ? birdJointKind : birdKind];

export const PREY_KIND_IDS: readonly string[] = PREY_KINDS.map((k) => k.id);

// UI スレッドの関数（worklet）に渡すのは、ここから下の、React の部品を含まない表だけにする
/** 種類 → 動きの部品 */
export const PREY_BEHAVIORS: Record<string, Behavior<any>> = Object.fromEntries(PREY_KINDS.map((k) => [k.id, k.behavior]));
/** 種類 → 描き方 */
export const PREY_RENDERERS: Record<string, Render<any>> = Object.fromEntries(PREY_KINDS.map((k) => [k.id, k.render]));
/* eslint-enable @typescript-eslint/no-explicit-any */
/** 種類 → 色の番号 */
export const PREY_COLORS: Record<string, PreyColor> = Object.fromEntries(PREY_KINDS.map((k) => [k.id, k.color]));

/** 種類から定義を引く。ない種類は undefined。 */
export function preyKindOf(id: string): PreyKind<unknown> | undefined {
  return PREY_KINDS.find((k) => k.id === id);
}
