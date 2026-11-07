/**
 * 遊びの設定の端末内保存（FR2.6, FR4.2。v0.1 で獲物の数 FR5.1〜FR5.5 を足した）。通信は要らない。
 * 初期値：自動で終わるまで 30 秒・音オン・背景は暗い・獲物は 5 匹。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const IDLE_SECONDS_OPTIONS = [30, 60, 120, 300] as const;
export type IdleSeconds = (typeof IDLE_SECONDS_OPTIONS)[number];
export type Background = 'dark' | 'light';

/** 遊び画面に出す獲物の数の範囲・刻み・最初の値（FR5.5。実機で調整するときはここだけ変える） */
export const PREY_COUNT = Object.freeze({ min: 5, max: 50, step: 5, initial: 5 });

/** 選べる獲物の数（5, 10, …, 50） */
export const PREY_COUNT_OPTIONS: readonly number[] = Object.freeze(
  Array.from({ length: Math.floor((PREY_COUNT.max - PREY_COUNT.min) / PREY_COUNT.step) + 1 }, (_, i) => PREY_COUNT.min + i * PREY_COUNT.step),
);

/** 選べる獲物の数か（範囲の中で、刻みに合っている整数）。 */
export function isPreyCount(value: unknown): value is number {
  return typeof value === 'number' && PREY_COUNT_OPTIONS.includes(value);
}

/** 獲物の数を範囲の中に収める。数でないときは最初の値。 */
export function clampPreyCount(value: number): number {
  if (!Number.isFinite(value)) return PREY_COUNT.initial;
  return Math.min(PREY_COUNT.max, Math.max(PREY_COUNT.min, Math.round(value)));
}

export type PlaySettings = {
  idleSeconds: IdleSeconds;
  soundOn: boolean;
  background: Background;
  preyCount: number;
};

export const DEFAULT_SETTINGS: PlaySettings = Object.freeze({
  idleSeconds: 30,
  soundOn: true,
  background: 'dark',
  preyCount: PREY_COUNT.initial,
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
    // 範囲の外・刻みに合わない・読めない値は、最初の値に戻す（FR5.4）
    preyCount: isPreyCount(v.preyCount) ? v.preyCount : DEFAULT_SETTINGS.preyCount,
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
