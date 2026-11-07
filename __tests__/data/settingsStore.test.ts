import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  createSettingsStore,
  DEFAULT_SETTINGS,
  PREY_COUNT_OPTIONS,
  SETTINGS_STORAGE_KEY,
} from '../../src/data/settingsStore';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('settingsStore (FR4.2, FR2.6)', () => {
  it('starts with 30 seconds, sound on, a dark background and 5 prey', async () => {
    expect(await createSettingsStore().load()).toEqual({ idleSeconds: 30, soundOn: true, background: 'dark', preyCount: 5 });
    expect(DEFAULT_SETTINGS.idleSeconds).toBe(30);
  });

  it('keeps changed settings for the next play, even with a new store instance', async () => {
    await createSettingsStore().save({ idleSeconds: 120, soundOn: false, background: 'light', preyCount: 30 });
    expect(await createSettingsStore().load()).toEqual({ idleSeconds: 120, soundOn: false, background: 'light', preyCount: 30 });
  });

  it('falls back to defaults for broken or unknown stored values', async () => {
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, '{not json');
    expect(await createSettingsStore().load()).toEqual(DEFAULT_SETTINGS);
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ idleSeconds: 45, soundOn: 'yes', background: 'light' }));
    expect(await createSettingsStore().load()).toEqual({ idleSeconds: 30, soundOn: true, background: 'light', preyCount: 5 });
  });

  it('offers 5 to 50 prey in steps of 5 (FR5.1, FR5.5)', () => {
    expect(PREY_COUNT_OPTIONS).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
  });

  it.each([
    ['above the range', 55],
    ['below the range', 0],
    ['not a step of 5', 12],
    ['not a number', '30'],
    ['missing', undefined],
  ])('goes back to 5 prey when the stored count is %s (FR5.3, FR5.4)', async (_label, preyCount) => {
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ idleSeconds: 60, soundOn: true, background: 'dark', preyCount }));
    expect(await createSettingsStore().load()).toEqual({ idleSeconds: 60, soundOn: true, background: 'dark', preyCount: 5 });
  });

  it('reads settings saved by v0.0.0 (without a prey count) with 5 prey', async () => {
    // v0.0.0 で保存した設定（獲物の数がない）を読むと、獲物の数は最初の値になる
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ idleSeconds: 120, soundOn: false, background: 'light' }));
    expect((await createSettingsStore().load()).preyCount).toBe(5);
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
