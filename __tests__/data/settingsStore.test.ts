import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  canChangePreyCount,
  changePreyCount,
  createSettingsStore,
  DEFAULT_SETTINGS,
  PREY_COUNT,
  PREY_COUNT_PRESETS,
  preyCountsKey,
  SETTINGS_STORAGE_KEY,
  totalPrey,
} from '../../src/data/settingsStore';

const ONE_EACH = { string: 1, tail: 1, teaser: 1, mouse: 1, bird: 1 };
const SIX_EACH = { string: 6, tail: 6, teaser: 6, mouse: 6, bird: 6 };

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('settingsStore (FR4.2, FR2.6)', () => {
  it('starts with 30 seconds, sound on, a dark background and 5 prey', async () => {
    expect(await createSettingsStore().load()).toEqual({ idleSeconds: 30, soundOn: true, background: 'dark', preyCounts: ONE_EACH });
    expect(DEFAULT_SETTINGS.idleSeconds).toBe(30);
  });

  it('keeps changed settings for the next play, even with a new store instance', async () => {
    const preyCounts = { string: 0, tail: 2, teaser: 0, mouse: 3, bird: 45 };
    await createSettingsStore().save({ idleSeconds: 120, soundOn: false, background: 'light', preyCounts });
    expect(await createSettingsStore().load()).toEqual({ idleSeconds: 120, soundOn: false, background: 'light', preyCounts });
  });

  it('falls back to defaults for broken or unknown stored values', async () => {
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, '{not json');
    expect(await createSettingsStore().load()).toEqual(DEFAULT_SETTINGS);
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ idleSeconds: 45, soundOn: 'yes', background: 'light' }));
    expect(await createSettingsStore().load()).toEqual({ idleSeconds: 30, soundOn: true, background: 'light', preyCounts: ONE_EACH });
  });

  it('starts with 1 of each of the 5 kinds, and keeps the range in one place (FR5.3, FR5.5)', () => {
    expect(DEFAULT_SETTINGS.preyCounts).toEqual(ONE_EACH);
    expect(PREY_COUNT).toEqual({ perKindMin: 0, totalMin: 1, totalMax: 50, initialEach: 1 });
  });

  it('offers the three test sets: same as v0.0.0 (no bird), 6 each, 10 each (FR5.2)', () => {
    expect(PREY_COUNT_PRESETS.map((p) => [p.id, p.counts])).toEqual([
      ['v0', { string: 1, tail: 1, teaser: 1, mouse: 1, bird: 0 }],
      ['each6', SIX_EACH],
      ['each10', { string: 10, tail: 10, teaser: 10, mouse: 10, bird: 10 }],
    ]);
    PREY_COUNT_PRESETS.forEach((p) => expect(totalPrey(p.counts)).toBeLessThanOrEqual(PREY_COUNT.totalMax));
  });

  it('lets a kind go down to 0, but never lets the total go above 50 or down to 0 (FR5.1)', () => {
    const almostFull = { string: 10, tail: 10, teaser: 10, mouse: 10, bird: 9 };
    expect(canChangePreyCount(almostFull, 'bird', 1)).toBe(true);
    const full = changePreyCount(almostFull, 'bird', 1);
    expect(totalPrey(full)).toBe(50);
    expect(canChangePreyCount(full, 'string', 1)).toBe(false);
    expect(changePreyCount(full, 'string', 1)).toBe(full);

    const onlyOne = { string: 1, tail: 0, teaser: 0, mouse: 0, bird: 0 };
    expect(canChangePreyCount(onlyOne, 'string', -1)).toBe(false);
    expect(canChangePreyCount(onlyOne, 'tail', -1)).toBe(false);
    expect(changePreyCount(ONE_EACH, 'bird', -1)).toEqual({ ...ONE_EACH, bird: 0 });
    expect(canChangePreyCount(ONE_EACH, 'snake', 1)).toBe(false);
  });

  it('gives the same key for the same numbers, so the play field makes the prey again only when they change (FR5.2)', () => {
    // 遊び画面はこの文字列で比べて、世界を作り直すかを決める（テストの reanimated の置き換えは描くたびに共有値を作り直すので、ここで確かめる）
    expect(preyCountsKey({ ...ONE_EACH })).toBe(preyCountsKey(ONE_EACH));
    expect(preyCountsKey({ string: 1, tail: 1, teaser: 1, mouse: 1 })).toBe(preyCountsKey({ ...ONE_EACH, bird: 0 }));
    expect(preyCountsKey({ ...ONE_EACH, bird: 0 })).not.toBe(preyCountsKey(ONE_EACH));
    expect(preyCountsKey({ ...ONE_EACH, string: 2, tail: 0 })).not.toBe(preyCountsKey({ ...ONE_EACH, string: 0, tail: 2 }));
  });

  it.each([
    ['a total above 50', { string: 11, tail: 10, teaser: 10, mouse: 10, bird: 10 }],
    ['a total of 0', { string: 0, tail: 0, teaser: 0, mouse: 0, bird: 0 }],
    ['a negative count', { string: -1, tail: 2, teaser: 0, mouse: 0, bird: 0 }],
    ['a count that is not whole', { string: 1.5, tail: 1, teaser: 1, mouse: 1, bird: 1 }],
    ['a count that is not a number', { string: '3', tail: 1, teaser: 1, mouse: 1, bird: 1 }],
    ['not an object', 30],
    ['a list', [1, 1, 1, 1, 1]],
  ])('goes back to 1 of each kind when the stored counts have %s (FR5.4)', async (_label, preyCounts) => {
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ idleSeconds: 60, soundOn: true, background: 'dark', preyCounts }));
    expect(await createSettingsStore().load()).toEqual({ idleSeconds: 60, soundOn: true, background: 'dark', preyCounts: ONE_EACH });
  });

  it('treats a kind that is not written as 0, and drops kinds that are not in the list (FR5.4)', async () => {
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ idleSeconds: 60, soundOn: true, background: 'dark', preyCounts: { mouse: 3, snake: 9 } }));
    expect((await createSettingsStore().load()).preyCounts).toEqual({ string: 0, tail: 0, teaser: 0, mouse: 3, bird: 0 });
  });

  it.each([
    [5, ONE_EACH],
    [30, SIX_EACH],
    [50, { string: 10, tail: 10, teaser: 10, mouse: 10, bird: 10 }],
  ])('turns an old prey count of %s into the same split per kind (FR5.4)', async (preyCount, expected) => {
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ idleSeconds: 60, soundOn: true, background: 'dark', preyCount }));
    expect(await createSettingsStore().load()).toEqual({ idleSeconds: 60, soundOn: true, background: 'dark', preyCounts: expected });
  });

  it.each([
    ['above the old range', 55],
    ['below the old range', 0],
    ['not a step of 5', 12],
    ['not a number', '30'],
  ])('goes back to 1 of each kind when the old prey count is %s (FR5.4)', async (_label, preyCount) => {
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ idleSeconds: 60, soundOn: true, background: 'dark', preyCount }));
    expect((await createSettingsStore().load()).preyCounts).toEqual(ONE_EACH);
  });

  it('prefers the counts per kind when both the new and the old values are stored', async () => {
    const preyCounts = { string: 1, tail: 1, teaser: 1, mouse: 1, bird: 0 };
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ idleSeconds: 60, soundOn: true, background: 'dark', preyCount: 30, preyCounts }));
    expect((await createSettingsStore().load()).preyCounts).toEqual(preyCounts);
  });

  it('reads settings saved by v0.0.0 (without a prey count) with 1 of each kind', async () => {
    // v0.0.0 で保存した設定（獲物の数がない）を読むと、獲物の数は最初の値になる
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ idleSeconds: 120, soundOn: false, background: 'light' }));
    expect((await createSettingsStore().load()).preyCounts).toEqual(ONE_EACH);
  });

  it('reports a write failure to the caller', async () => {
    const failing = {
      getItem: jest.fn(async () => null),
      setItem: jest.fn(async () => {
        throw new Error('disk full');
      }),
      removeItem: jest.fn(async () => undefined),
    };
    await expect(createSettingsStore(failing).save(DEFAULT_SETTINGS)).rejects.toThrow('disk full');
  });
});
