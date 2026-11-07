import { PREY_KIND_IDS } from '../../src/prey/kinds';
import { lineUpPrey, splitEvenly, toPreyCounts, totalOf } from '../../src/prey/mix';

const FIVE_KINDS = ['string', 'tail', 'teaser', 'mouse', 'bird'];
const countsOf = (total: number, kinds: readonly string[] = FIVE_KINDS) => splitEvenly(total, kinds).map((m) => m.count);

describe('獲物の混ぜ方 (FR5.2, FR5.4)', () => {
  it('lines up exactly the number chosen for each kind, skipping kinds with 0 (FR5.2)', () => {
    const lineUp = lineUpPrey({ string: 1, tail: 1, teaser: 1, mouse: 1, bird: 0 });
    expect(lineUp.map((p) => p.kind)).toEqual(['string', 'tail', 'teaser', 'mouse']);
    // 0 匹の種類を飛ばして、順番は 0 から続けて付く（v0.0.0 と同じ出てくる順番）
    expect(lineUp.map((p) => p.order)).toEqual([0, 1, 2, 3]);
  });

  it('lines the prey up kind by kind, numbering them in turn across the kinds that still have prey', () => {
    const lineUp = lineUpPrey({ a: 3, b: 3, c: 2, d: 2 }, ['a', 'b', 'c', 'd']);
    expect(lineUp.map((p) => p.kind)).toEqual(['a', 'a', 'a', 'b', 'b', 'b', 'c', 'c', 'd', 'd']);
    expect(lineUp.filter((p) => p.kind === 'a').map((p) => p.order)).toEqual([0, 4, 8]);
    expect(lineUp.filter((p) => p.kind === 'd').map((p) => p.order)).toEqual([3, 7]);

    const uneven = lineUpPrey({ a: 3, b: 0, c: 1 }, ['a', 'b', 'c']);
    expect(uneven).toEqual([
      { kind: 'a', order: 0 },
      { kind: 'a', order: 2 },
      { kind: 'a', order: 3 },
      { kind: 'c', order: 1 },
    ]);
  });

  it('gives the same order as before when every kind has the same number (30 = 6 each)', () => {
    const lineUp = lineUpPrey(toPreyCounts(splitEvenly(30)));
    // 前の式：order = 回った数 × 種類の数 + 一覧の位置
    const before = PREY_KIND_IDS.flatMap((kind, kindIndex) =>
      Array.from({ length: 6 }, (_, round) => ({ kind, order: round * PREY_KIND_IDS.length + kindIndex })),
    );
    expect(lineUp).toEqual(before);
  });

  it('ignores kinds that are not in the list, and counts that are not whole positive numbers', () => {
    const lineUp = lineUpPrey({ string: 2, snake: 4, tail: -1, teaser: Number.NaN, mouse: 1.7 } as Record<string, number>);
    expect(lineUp.map((p) => p.kind)).toEqual(['string', 'string', 'mouse']);
    expect(totalOf({ string: 2, snake: 4, mouse: 1 })).toBe(3);
  });

  it('splits an old total evenly: 1 each for 5, 6 each for 30, 10 each for 50 (FR5.4)', () => {
    expect(countsOf(5)).toEqual([1, 1, 1, 1, 1]);
    expect(countsOf(30)).toEqual([6, 6, 6, 6, 6]);
    expect(countsOf(50)).toEqual([10, 10, 10, 10, 10]);
    expect(splitEvenly(5).map((m) => m.kind)).toEqual(PREY_KIND_IDS);
  });

  it('adds the remainder one by one from the top of the kind list when splitting', () => {
    expect(countsOf(7)).toEqual([2, 2, 1, 1, 1]);
    expect(countsOf(Number.NaN)).toEqual([0, 0, 0, 0, 0]);
    expect(splitEvenly(10, [])).toEqual([]);
  });
});
