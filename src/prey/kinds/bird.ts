/**
 * 小鳥の定義（FR2.1〜FR2.9）。
 * 2026-11-07 から、この小鳥は種類の一覧（kinds/index.ts）に入れない（ID が関節つきの小鳥と同じ bird なので、入れるとぶつかる）。
 * 動きの数・大きさ・音・色は、関節つきの小鳥（kinds/birdJoint.ts）が借りて使う。
 * 動きの数はここに置き、実機で調整する（FR2.8。最初の値は要件のとおり）。
 * 見た目は Skia で描く。EXPO_PUBLIC_BIRD_RIVE=1 で Rive のファイルがあれば、Rive で描いた表示を重ねる（FR2.9）。
 */
import { birdHopBehavior, type BirdMotion, type BirdState } from '../behaviors/birdHop';
import { drawBird } from '../render/bird';
import { BirdRive } from '../render/BirdRive';
import type { PreyKind } from '../types';

/** 小鳥の動きの数（タブレットを基準にした画面の点・ミリ秒） */
export const BIRD_MOTION: BirdMotion = {
  // FR2.1：1 回の跳ねで 40 点、0.15 秒。跳ねたあと 0.3〜0.9 秒止まる
  hopLength: 40,
  hopMs: 150,
  restMs: [300, 900],
  // FR2.2：指が 150 点以内に触れたら逃げる
  noticeRadius: 150,
  // FR2.3：秒速 900 点で逃げる（今の獲物の逃げる速さと同じ）
  fleeSpeed: 900,
  // FR2.4：画面の端から 40 点で向きを変える
  edgeTurn: 40,
  // FR2.5：画面の外へ逃げてから 2〜5 秒で、端から歩いて入ってくる
  returnMs: [2_000, 5_000],
  // 遊び始めてから最初に入ってくるまでも、逃げたあとと同じだけ待つ
  firstEnterMs: [2_000, 5_000],
  // 1 回跳ねるごとに、歩く向きを ±0.5 ラジアンの中で振る（まっすぐ歩き続けないように）
  wander: 0.5,
  bodyRadius: 24,
  hitRadius: 40,
};

/** 小鳥の大きさ。スマートフォンはタブレットの 75%（ネズミと同じ割合。FR2.7） */
export const BIRD_SIZE = { tablet: 1.6, phone: 1.2 };

/* eslint-disable @typescript-eslint/no-require-imports */
export const birdKind: PreyKind<BirdState> = {
  id: 'bird',
  label: '小鳥',
  behavior: birdHopBehavior(BIRD_MOTION),
  render: drawBird,
  sounds: {
    // 跳ねるたびの小さな「チッ」（たくさんの小鳥が同時に跳ねても鳴りすぎないよう、間隔を空ける）
    hop: { sources: [require('../../../assets/sounds/bird-hop.wav')], minGapMs: 90 },
    // 逃げるときの羽ばたき「パタタッ」
    flap: { sources: [require('../../../assets/sounds/bird-flap.wav')], minGapMs: 150 },
  },
  size: BIRD_SIZE,
  // 遊び画面の色の 2 番目（暗い背景でも明るい背景でも黄色）
  color: 1,
  Overlay: BirdRive,
};
/* eslint-enable @typescript-eslint/no-require-imports */
