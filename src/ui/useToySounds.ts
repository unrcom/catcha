/**
 * 遊び画面の短い音（FR2.6。v0.1 で FR4.4：獲物の種類の定義に書かれた音から再生器を作る形にした）。
 * 音がオフなら何も鳴らさない。音のファイルは scripts/make-sounds.mjs で作る。
 * - 種類ごと・音の名前ごとに別の再生器で鳴らすので、同時に動いても消し合わない
 * - 同じ音が続けて鳴る間隔の下限は、定義の minGapMs（「捕まえた」の音はここで決める）
 * - 音が 2 つ以上ある名前は順番に鳴らす（ネズミの「テ」「ケ」）
 * - 鳴り終わったら頭に戻しておく
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioSource } from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { PREY_KINDS } from '../prey/kinds';
import type { PreyKind } from '../prey/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const STARTLE_SOUND: AudioSource = require('../../assets/sounds/startle.wav');
/** 「捕まえた」の音が続けて鳴る間隔の下限 */
const STARTLE_MIN_GAP_MS = 120;
const STARTLE_KEY = '#startle';

/** 1 つの音の再生器のまとまり。 */
type Bank = { players: AudioPlayer[]; next: number; minGapMs: number; lastPlayed: number };

const bankKey = (kind: string, cue: string) => `${kind}:${cue}`;

function replay(player: AudioPlayer, label: string) {
  try {
    // 前に鳴らし終えた位置にいるときだけ戻す（鳴り終わりで先に戻しておくので、ふつうはすぐ鳴る）
    if (player.currentTime > 0) player.seekTo(0).catch((error) => console.warn(`[sound] seek failed (${label})`, error));
    player.play();
  } catch (error) {
    console.warn(`[sound] play failed (${label})`, error);
  }
}

/** 鳴り終わったら頭に戻しておく。次に鳴らすとき、戻すのを待たずにすぐ鳴るように。 */
function rewindOnFinish(player: AudioPlayer, label: string): { remove: () => void } {
  return player.addListener('playbackStatusUpdate', (status) => {
    if (!status.didJustFinish) return;
    player.pause();
    player.seekTo(0).catch((error) => console.warn(`[sound] rewind failed (${label})`, error));
  });
}

/** 再生器を作る。作れないときは知らせて、その音は鳴らさない（遊びは止めない）。 */
function makePlayer(source: AudioSource, label: string): AudioPlayer | null {
  try {
    return createAudioPlayer(source);
  } catch (error) {
    console.warn(`[sound] could not create player (${label})`, error);
    return null;
  }
}

/** 定義の音から、音の名前ごとの再生器を作る。 */
function createBanks(kinds: readonly PreyKind<unknown>[]): Map<string, Bank> {
  const banks = new Map<string, Bank>();
  const add = (key: string, sources: AudioSource[], minGapMs: number) => {
    const players = sources
      .map((source, i) => makePlayer(source, `${key}:${i}`))
      .filter((p): p is AudioPlayer => p !== null);
    banks.set(key, { players, next: 0, minGapMs, lastPlayed: 0 });
  };
  for (const kind of kinds) {
    for (const [cue, sound] of Object.entries(kind.sounds)) add(bankKey(kind.id, cue), sound.sources, sound.minGapMs);
  }
  add(STARTLE_KEY, [STARTLE_SOUND], STARTLE_MIN_GAP_MS);
  return banks;
}

function releaseBanks(banks: Map<string, Bank>, subscriptions: { remove: () => void }[]) {
  subscriptions.forEach((s) => s.remove());
  banks.forEach((bank, key) =>
    bank.players.forEach((player) => {
      try {
        player.remove();
      } catch (error) {
        console.warn(`[sound] could not release player (${key})`, error);
      }
    }),
  );
}

export function useToySounds(soundOn: boolean, kinds: readonly PreyKind<unknown>[] = PREY_KINDS) {
  const banks = useRef<Map<string, Bank>>(new Map());
  const warnedMissing = useRef(new Set<string>());
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  useEffect(() => {
    const created = createBanks(kinds);
    const subscriptions: { remove: () => void }[] = [];
    created.forEach((bank, key) => bank.players.forEach((p, i) => subscriptions.push(rewindOnFinish(p, `${key}:${i}`))));
    banks.current = created;
    return () => {
      banks.current = new Map();
      releaseBanks(created, subscriptions);
    };
  }, [kinds]);

  useEffect(() => {
    if (!soundOn) return;
    // 消音スイッチがオンでも鳴らし、ほかのアプリの音は止めない
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch((error) =>
      console.warn('[sound] could not set audio mode', error),
    );
  }, [soundOn]);

  const playKey = useCallback((key: string) => {
    if (!soundOnRef.current) return;
    const bank = banks.current.get(key);
    if (!bank) {
      // 定義にない音の名前（作りの誤り）。毎フレーム出ないよう 1 回だけ知らせる
      if (!warnedMissing.current.has(key)) console.warn(`[sound] no sound is defined for ${key}`);
      warnedMissing.current.add(key);
      return;
    }
    if (bank.players.length === 0) return; // 作れなかった再生器は、作るときに知らせている
    const now = Date.now();
    if (now - bank.lastPlayed < bank.minGapMs) return;
    bank.lastPlayed = now;
    const player = bank.players[bank.next % bank.players.length];
    bank.next = (bank.next + 1) % bank.players.length;
    replay(player, key);
  }, []);

  return useMemo(
    () => ({
      /** 種類の定義の sounds にある名前の音を鳴らす（ない名前は鳴らさない） */
      play: (kind: string, cue: string) => playKey(bankKey(kind, cue)),
      /** 「捕まえた」の音 */
      playStartle: () => playKey(STARTLE_KEY),
    }),
    [playKey],
  );
}
