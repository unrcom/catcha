/**
 * 遊び画面の短い音（FR2.6）。音がオフなら何も鳴らさない。
 * 音のファイルは scripts/make-sounds.mjs で作る。
 */
import { setAudioModeAsync, useAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef } from 'react';

/* eslint-disable @typescript-eslint/no-require-imports */
// オブジェクトごとに違う音（動作確認の依頼で分けた。猫じゃらしは「ボヨーン」）
const MOVE_SOUNDS = {
  string: require('../../assets/sounds/string.wav'),
  tail: require('../../assets/sounds/tail.wav'),
  teaser: require('../../assets/sounds/teaser.wav'),
};
// ネズミの足音「テ」「ケ」。交互に鳴らして「テケテケ」にする
const STEP_SOUNDS = [require('../../assets/sounds/mouse-te.wav'), require('../../assets/sounds/mouse-ke.wav')];
const STARTLE_SOUND = require('../../assets/sounds/startle.wav');
/* eslint-enable @typescript-eslint/no-require-imports */

/** 見えたとき・動いたときに音を鳴らすもの。それぞれ別の音を別の再生器で鳴らすので、同時に動いても消し合わない */
export type MoveSource = 'string' | 'tail' | 'teaser';

/** 同じものが続けて鳴らす間隔の下限（足音は、逃げるときの速い足どりでも続けて鳴るように短く） */
const MIN_GAP_MS = { move: 1000, step: 60, startle: 120 } as const;

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
function useRewindOnFinish(player: AudioPlayer, label: string) {
  useEffect(() => {
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (!status.didJustFinish) return;
      player.pause();
      player.seekTo(0).catch((error) => console.warn(`[sound] rewind failed (${label})`, error));
    });
    return () => subscription.remove();
  }, [player, label]);
}

export function useToySounds(soundOn: boolean) {
  const movePlayers: Record<MoveSource, AudioPlayer> = {
    string: useAudioPlayer(MOVE_SOUNDS.string),
    tail: useAudioPlayer(MOVE_SOUNDS.tail),
    teaser: useAudioPlayer(MOVE_SOUNDS.teaser),
  };
  const stepTe = useAudioPlayer(STEP_SOUNDS[0]);
  const stepKe = useAudioPlayer(STEP_SOUNDS[1]);
  const startlePlayer = useAudioPlayer(STARTLE_SOUND);
  useRewindOnFinish(movePlayers.string, 'move:string');
  useRewindOnFinish(movePlayers.tail, 'move:tail');
  useRewindOnFinish(movePlayers.teaser, 'move:teaser');
  useRewindOnFinish(stepTe, 'step:te');
  useRewindOnFinish(stepKe, 'step:ke');
  useRewindOnFinish(startlePlayer, 'startle');
  const lastPlayed = useRef<Record<MoveSource | 'step' | 'startle', number>>({ string: 0, tail: 0, teaser: 0, step: 0, startle: 0 });
  const nextStep = useRef(0);

  useEffect(() => {
    if (!soundOn) return;
    // 消音スイッチがオンでも鳴らし、ほかのアプリの音は止めない
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch((error) =>
      console.warn('[sound] could not set audio mode', error),
    );
  }, [soundOn]);

  const { string, tail, teaser } = movePlayers;
  const play = useCallback(
    (key: MoveSource | 'step' | 'startle') => {
      if (!soundOn) return;
      const now = Date.now();
      const gap = key === 'startle' ? MIN_GAP_MS.startle : key === 'step' ? MIN_GAP_MS.step : MIN_GAP_MS.move;
      if (now - lastPlayed.current[key] < gap) return;
      lastPlayed.current[key] = now;
      let player: AudioPlayer;
      if (key === 'startle') player = startlePlayer;
      else if (key === 'step') {
        player = nextStep.current === 0 ? stepTe : stepKe;
        nextStep.current = 1 - nextStep.current;
      } else player = { string, tail, teaser }[key];
      replay(player, key);
    },
    [soundOn, string, tail, teaser, stepTe, stepKe, startlePlayer],
  );

  return useMemo(
    () => ({
      playMove: (source: MoveSource) => play(source),
      /** ネズミの足音を1つ（「テ」と「ケ」を交互に） */
      playStep: () => play('step'),
      playStartle: () => play('startle'),
    }),
    [play],
  );
}
