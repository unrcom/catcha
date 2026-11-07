/**
 * 獲物の混ぜ方（FR5.2）。獲物の数を、種類の一覧（src/prey/kinds/index.ts）の数で同じ数ずつに分ける。
 * 割り切れないときは、一覧の先頭の種類から 1 匹ずつ足す。数は範囲（settingsStore の PREY_COUNT）の中に収める。
 */
import { clampPreyCount } from '../data/settingsStore';
import { PREY_KIND_IDS } from './kinds';

export type KindCount = { kind: string; count: number };

/** 種類ごとの数（一覧の順番）。 */
export function mixPrey(count: number, kindIds: readonly string[] = PREY_KIND_IDS): KindCount[] {
  if (kindIds.length === 0) return [];
  const total = clampPreyCount(count);
  const each = Math.floor(total / kindIds.length);
  const extra = total % kindIds.length;
  return kindIds.map((kind, i) => ({ kind, count: each + (i < extra ? 1 : 0) }));
}

/**
 * 作る獲物を 1 匹ずつ並べる。並びは種類ごと（一覧の順番。描く順番・当たりを調べる順番になる）で、
 * order は種類を順に回したときの順番（紐 → しっぽ → 猫じゃらし → ネズミ → 紐 → …）。登場の時刻をずらすのに使う。
 */
export function lineUpPrey(count: number, kindIds: readonly string[] = PREY_KIND_IDS): { kind: string; order: number }[] {
  const mix = mixPrey(count, kindIds);
  const lineUp: { kind: string; order: number }[] = [];
  mix.forEach(({ kind, count: n }, kindIndex) => {
    for (let round = 0; round < n; round += 1) lineUp.push({ kind, order: round * mix.length + kindIndex });
  });
  return lineUp;
}
