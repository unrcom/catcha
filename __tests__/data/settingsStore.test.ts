import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  createSettingsStore,
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
} from '../../src/data/settingsStore';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('settingsStore (FR4.2, FR2.6)', () => {
  it('starts with 30 seconds, sound on and a dark background', async () => {
    expect(await createSettingsStore().load()).toEqual({ idleSeconds: 30, soundOn: true, background: 'dark' });
    expect(DEFAULT_SETTINGS.idleSeconds).toBe(30);
  });

  it('keeps changed settings for the next play, even with a new store instance', async () => {
    await createSettingsStore().save({ idleSeconds: 120, soundOn: false, background: 'light' });
    expect(await createSettingsStore().load()).toEqual({ idleSeconds: 120, soundOn: false, background: 'light' });
  });

  it('falls back to defaults for broken or unknown stored values', async () => {
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, '{not json');
    expect(await createSettingsStore().load()).toEqual(DEFAULT_SETTINGS);
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ idleSeconds: 45, soundOn: 'yes', background: 'light' }));
    expect(await createSettingsStore().load()).toEqual({ idleSeconds: 30, soundOn: true, background: 'light' });
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
