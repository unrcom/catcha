/**
 * 遊びの設定の端末内保存（FR2.6, FR4.2）。通信は要らない。
 * 初期値：自動で終わるまで 30 秒・音オン・背景は暗い。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const IDLE_SECONDS_OPTIONS = [30, 60, 120, 300] as const;
export type IdleSeconds = (typeof IDLE_SECONDS_OPTIONS)[number];
export type Background = 'dark' | 'light';

export type PlaySettings = {
  idleSeconds: IdleSeconds;
  soundOn: boolean;
  background: Background;
};

export const DEFAULT_SETTINGS: PlaySettings = Object.freeze({
  idleSeconds: 30,
  soundOn: true,
  background: 'dark',
});

export const SETTINGS_STORAGE_KEY = 'nekoui.settings.v1';

export type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

function isIdleSeconds(value: unknown): value is IdleSeconds {
  return IDLE_SECONDS_OPTIONS.includes(value as IdleSeconds);
}

/** 保存されていた値を確かめ、正しくない項目は初期値に戻す。 */
export function parseSettings(raw: unknown): PlaySettings {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    idleSeconds: isIdleSeconds(v.idleSeconds) ? v.idleSeconds : DEFAULT_SETTINGS.idleSeconds,
    soundOn: typeof v.soundOn === 'boolean' ? v.soundOn : DEFAULT_SETTINGS.soundOn,
    background: v.background === 'light' || v.background === 'dark' ? v.background : DEFAULT_SETTINGS.background,
  };
}

export type SettingsStore = {
  load(): Promise<PlaySettings>;
  save(settings: PlaySettings): Promise<void>;
};

export function createSettingsStore(storage: KeyValueStorage = AsyncStorage): SettingsStore {
  return {
    async load() {
      let raw: string | null;
      try {
        raw = await storage.getItem(SETTINGS_STORAGE_KEY);
      } catch (error) {
        console.warn('[settings] could not read settings, using defaults', error);
        return { ...DEFAULT_SETTINGS };
      }
      if (raw === null) return { ...DEFAULT_SETTINGS };
      try {
        return parseSettings(JSON.parse(raw));
      } catch (error) {
        console.warn('[settings] stored settings were not valid JSON, using defaults', error);
        return { ...DEFAULT_SETTINGS };
      }
    },

    async save(settings) {
      // 保存に失敗したときは呼び出し側に伝える（画面で知らせる）
      await storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(parseSettings(settings)));
    },
  };
}
