/**
 * 遊びの設定の端末内保存（FR2.6, FR4.2。v0.1 で獲物の数 FR5.1〜FR5.5 を足し、範囲の変更（2026-11-07）で種類ごとの数にした）。通信は要らない。
 * 初期値：自動で終わるまで 30 秒・音オン・背景は暗い・獲物は 5 種類を 1 匹ずつ（合計 5 匹）。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { PREY_KIND_IDS } from '../prey/kinds';
import { splitEvenly, toPreyCounts, totalOf, type PreyCounts } from '../prey/mix';

export type { PreyCounts } from '../prey/mix';

export const IDLE_SECONDS_OPTIONS = [30, 60, 120, 300] as const;
export type IdleSeconds = (typeof IDLE_SECONDS_OPTIONS)[number];
export type Background = 'dark' | 'light';

/**
 * 獲物の種類ごとの数の決まり（FR5.1・FR5.3・FR5.5。実機で調整するときはここだけ変える）。
 * 種類ごとに perKindMin 匹から選べ、合計は totalMin〜totalMax 匹。最初の値は、どの種類も initialEach 匹。
 */
export const PREY_COUNT = Object.freeze({ perKindMin: 0, totalMin: 1, totalMax: 50, initialEach: 1 });

/** どの種類も n 匹。 */
function eachKind(n: number): PreyCounts {
  return Object.freeze(Object.fromEntries(PREY_KIND_IDS.map((kind) => [kind, n])));
}

/**
 * まとめて選べる組み合わせ（FR5.2）。v0.1 の比べるための試験に使う。
 * 「v0.0.0 と同じ」は v0.0.0 のコードで確かめた数：紐・しっぽ・猫じゃらしが 1 本ずつ同時に動き、ネズミが 1 匹ときどき出る。小鳥はいない。
 */
export const PREY_COUNT_PRESETS: readonly { id: string; label: string; counts: PreyCounts }[] = Object.freeze([
  { id: 'v0', label: 'v0.0.0 と同じ', counts: Object.freeze({ ...eachKind(1), bird: 0 }) },
  { id: 'each6', label: '各 6 匹（30 匹）', counts: eachKind(6) },
  { id: 'each10', label: '各 10 匹（50 匹）', counts: eachKind(10) },
]);

/** 種類ごとの数の合計。 */
export function totalPrey(counts: PreyCounts): number {
  return totalOf(counts);
}

/** 種類ごとの数を、一覧のすべての種類について持つ形にそろえる（書いていない種類は 0 匹）。 */
function fillKinds(counts: PreyCounts): PreyCounts {
  return Object.fromEntries(PREY_KIND_IDS.map((kind) => [kind, counts[kind] ?? 0]));
}

/**
 * 正しい種類ごとの数か（FR5.1・FR5.4）。一覧の種類の数がどれも perKindMin 以上の整数で、合計が範囲の中。
 * 一覧にない種類（前の版の種類など）は数えない。書いていない種類は 0 匹とみなす。
 */
export function isPreyCounts(value: unknown): value is PreyCounts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const each = PREY_KIND_IDS.every((kind) => {
    const n = v[kind] ?? 0;
    return typeof n === 'number' && Number.isInteger(n) && n >= PREY_COUNT.perKindMin;
  });
  if (!each) return false;
  const total = totalOf(v as PreyCounts);
  return total >= PREY_COUNT.totalMin && total <= PREY_COUNT.totalMax;
}

/** 一つの種類を delta 匹増やせるか（減らすときは delta を負に）。種類ごとの下限・合計の範囲を守るか。 */
export function canChangePreyCount(counts: PreyCounts, kind: string, delta: number): boolean {
  if (!PREY_KIND_IDS.includes(kind)) return false;
  const next = (counts[kind] ?? 0) + delta;
  const total = totalPrey(counts) + delta;
  return next >= PREY_COUNT.perKindMin && total >= PREY_COUNT.totalMin && total <= PREY_COUNT.totalMax;
}

/** 一つの種類を delta 匹増やした数。範囲を外れるときは、元の数をそのまま返す。 */
export function changePreyCount(counts: PreyCounts, kind: string, delta: number): PreyCounts {
  if (!canChangePreyCount(counts, kind, delta)) return counts;
  return { ...fillKinds(counts), [kind]: (counts[kind] ?? 0) + delta };
}

/** 種類ごとの数を、中身で比べるための文字列にする（一覧の順番に数を並べる。同じ数なら同じ文字列）。 */
export function preyCountsKey(counts: PreyCounts): string {
  return PREY_KIND_IDS.map((kind) => counts[kind] ?? 0).join(',');
}

/** 二つの種類ごとの数が同じか（一覧の種類で比べる）。 */
export function samePreyCounts(a: PreyCounts, b: PreyCounts): boolean {
  return PREY_KIND_IDS.every((kind) => (a[kind] ?? 0) === (b[kind] ?? 0));
}

/** 前の版（v0.1 の範囲の変更より前）で選べた獲物の数（5, 10, …, 50）。保存された値を直すときだけに使う。 */
const LEGACY_PREY_COUNT = Object.freeze({ min: 5, max: 50, step: 5 });

function isLegacyPreyCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= LEGACY_PREY_COUNT.min &&
    value <= LEGACY_PREY_COUNT.max &&
    (value - LEGACY_PREY_COUNT.min) % LEGACY_PREY_COUNT.step === 0
  );
}

/**
 * 保存されていた獲物の数を読む（FR5.4）。
 * - preyCounts（種類ごとの数）が正しければ、それを使う
 * - preyCounts がなく、前の版の preyCount（合計 1 つ）が正しければ、前と同じ分け方で種類ごとの数に直す
 * - どちらでもなければ、最初の値
 */
function readPreyCounts(v: Record<string, unknown>): PreyCounts {
  if (v.preyCounts !== undefined) return isPreyCounts(v.preyCounts) ? fillKinds(v.preyCounts) : DEFAULT_SETTINGS.preyCounts;
  if (isLegacyPreyCount(v.preyCount)) return toPreyCounts(splitEvenly(v.preyCount));
  return DEFAULT_SETTINGS.preyCounts;
}

export type PlaySettings = {
  idleSeconds: IdleSeconds;
  soundOn: boolean;
  background: Background;
  /** 獲物の種類ごとの数（FR5.1）。合計が遊び画面に出す獲物の数 */
  preyCounts: PreyCounts;
};

export const DEFAULT_SETTINGS: PlaySettings = Object.freeze({
  idleSeconds: 30,
  soundOn: true,
  background: 'dark',
  preyCounts: eachKind(PREY_COUNT.initialEach),
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
    // 範囲の外・読めない値は最初の値に戻す。前の版の「獲物の数」は種類ごとの数に直す（FR5.4）
    preyCounts: readPreyCounts(v),
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
