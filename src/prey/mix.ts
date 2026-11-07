/**
 * 獲物の混ぜ方（FR5.2・FR5.4）。
 * - 種類ごとの数（設定の値。settingsStore の preyCounts）から、作る獲物を 1 匹ずつ並べる
 * - splitEvenly は、前の版で保存した「獲物の数」（合計 1 つ）を種類ごとの数に直すときだけに使う
 *   （種類の一覧の数で同じ数ずつに分け、割り切れないときは一覧の先頭の種類から 1 匹ずつ足す）
 * 範囲（合計 1〜50 匹など）は settingsStore が決める。ここでは数を収めない。
 */
import { PREY_KIND_IDS } from './kinds';

export type KindCount = { kind: string; count: number };

/** 種類ごとの数（種類の id → 匹数）。一覧にない種類は数えない。書いていない種類は 0 匹。 */
export type PreyCounts = Readonly<Record<string, number>>;

/** 一つの種類の数を、0 以上の整数として読む。読めない値は 0。 */
function countOf(counts: PreyCounts, kind: string): number {
  const n = counts[kind];
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** 合計を、種類の一覧の数で同じ数ずつに分ける（一覧の順番）。割り切れないときは先頭の種類から 1 匹ずつ足す。 */
export function splitEvenly(total: number, kindIds: readonly string[] = PREY_KIND_IDS): KindCount[] {
  if (kindIds.length === 0) return [];
  const n = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const each = Math.floor(n / kindIds.length);
  const extra = n % kindIds.length;
  return kindIds.map((kind, i) => ({ kind, count: each + (i < extra ? 1 : 0) }));
}

/** 種類ごとの数の一覧（KindCount の並び）を、種類の id → 匹数 の形にする。 */
export function toPreyCounts(mix: readonly KindCount[]): Record<string, number> {
  return Object.fromEntries(mix.map(({ kind, count }) => [kind, count]));
}

/** 種類ごとの数の合計（一覧にある種類だけを数える）。 */
export function totalOf(counts: PreyCounts, kindIds: readonly string[] = PREY_KIND_IDS): number {
  return kindIds.reduce((sum, kind) => sum + countOf(counts, kind), 0);
}

/**
 * 作る獲物を 1 匹ずつ並べる。並びは種類ごと（一覧の順番。描く順番・当たりを調べる順番になる）。
 * order は、種類を順に回したときの順番（紐 → しっぽ → 猫じゃらし → ネズミ → 小鳥 → 紐 → …）で、登場の時刻をずらすのに使う。
 * 0 匹の種類と、数を出し切った種類は飛ばすので、order は 0 から続けて付く。
 */
export function lineUpPrey(counts: PreyCounts, kindIds: readonly string[] = PREY_KIND_IDS): { kind: string; order: number }[] {
  const wanted = kindIds.map((kind) => countOf(counts, kind));
  const orders: number[][] = kindIds.map(() => []);
  let order = 0;
  for (let round = 0; wanted.some((n) => n > round); round += 1) {
    wanted.forEach((n, kindIndex) => {
      if (n > round) {
        orders[kindIndex].push(order);
        order += 1;
      }
    });
  }
  return kindIds.flatMap((kind, kindIndex) => orders[kindIndex].map((o) => ({ kind, order: o })));
}
