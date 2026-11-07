import { splitEvenly, toPreyCounts, type PreyCounts } from '../../src/prey/mix';

/** 合計 total 匹を、5 種類に同じ数ずつ分けた種類ごとの数（30 匹なら各 6 匹）。 */
export function evenly(total: number): PreyCounts {
  return toPreyCounts(splitEvenly(total));
}
