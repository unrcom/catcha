import { PREY_COUNT } from '../../src/data/settingsStore';
import { PREY_KIND_IDS } from '../../src/prey/kinds';
import { lineUpPrey, mixPrey } from '../../src/prey/mix';

const FIVE_KINDS = ['string', 'tail', 'teaser', 'mouse', 'bird'];
const countsOf = (count: number, kinds: readonly string[] = FIVE_KINDS) => mixPrey(count, kinds).map((m) => m.count);
const total = (count: number) => mixPrey(count).reduce((n, m) => n + m.count, 0);

describe('獲物の混ぜ方 (FR5.2, FR5.4)', () => {
  it('puts the same number of each kind: 1 each for 5, 6 each for 30, 10 each for 50 (FR5.2)', () => {
    expect(countsOf(5)).toEqual([1, 1, 1, 1, 1]);
    expect(countsOf(30)).toEqual([6, 6, 6, 6, 6]);
    expect(countsOf(50)).toEqual([10, 10, 10, 10, 10]);
  });

  it('adds the remainder one by one from the top of the kind list, with the current list (FR5.2)', () => {
    const mix = mixPrey(5);
    expect(mix.map((m) => m.kind)).toEqual(PREY_KIND_IDS);
    expect(total(5)).toBe(5);
    const counts = mix.map((m) => m.count);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    // 多い種類は、一覧の先頭の方に並ぶ
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it('keeps a count outside the range inside it (FR5.4)', () => {
    expect(total(0)).toBe(PREY_COUNT.min);
    expect(total(55)).toBe(PREY_COUNT.max);
    expect(total(Number.NaN)).toBe(PREY_COUNT.initial);
  });

  it('lines the prey up kind by kind, numbering them in turn across the kinds', () => {
    const lineUp = lineUpPrey(10, ['a', 'b', 'c', 'd']);
    expect(lineUp.map((p) => p.kind)).toEqual(['a', 'a', 'a', 'b', 'b', 'b', 'c', 'c', 'd', 'd']);
    expect(lineUp.filter((p) => p.kind === 'a').map((p) => p.order)).toEqual([0, 4, 8]);
    expect(lineUp.filter((p) => p.kind === 'd').map((p) => p.order)).toEqual([3, 7]);
  });

  it('returns nothing when there is no kind', () => {
    expect(mixPrey(10, [])).toEqual([]);
  });
});
