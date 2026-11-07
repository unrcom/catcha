/**
 * 獲物の世界（FR1.1・FR4.2・FR4.3・FR4.5・FR5.2）。遊び画面のすべての獲物（エージェント）と波紋を 1 つの値にまとめる。
 * - createWorld：獲物の数・画面の大きさ・タブレットかどうかから作る（JS スレッド）
 * - stepWorld：全部を 1 フレーム進め、鳴らす音の合図を返す（UI スレッド）
 * - touchWorld：触った所の当たりを調べ、「捕まえた」（0.4 秒止まる）・逃げる・波紋を起こす（UI スレッド）
 * - 何も見えない時間が 5 秒を超えないよう、隠れている獲物を呼び戻す（v0.0.0 の keepSomethingOnScreen と
 *   同じ数え方を、何匹でも使えるようにしたもの）
 *
 * 獲物ごとの違いは、種類の動きの部品（kinds/index.ts の PREY_BEHAVIORS）に任せる。ここには種類ごとの分岐を書かない。
 * UI スレッドで動かす関数は 'worklet'。worklet は定義した時点で使う関数を取り込むので、使う関数より後ろに置く。
 */
import { MOTION } from '../ui/toyMotion';
import { PREY_BEHAVIORS, PREY_COLORS, PREY_KINDS } from './kinds';
import { lineUpPrey } from './mix';
import { RIPPLE_LIFE_MS } from './render/ripple';
import type { Agent, Field, Rand, RecallRank, SoundCue, TouchResult, Vec, World } from './types';

/** 1 フレームで進める時間の上限（秒）。止まっていたあとに大きく飛ばないように */
const MAX_DT = 0.05;

export type CreateWorldOptions = {
  count: number;
  field: Field;
  isTablet: boolean;
  now: number;
  rand?: Rand;
};

/** 獲物の世界を作る（JS スレッドで呼ぶ）。数は範囲の中に収め、種類を同じ数ずつ混ぜる。 */
export function createWorld({ count, field, isTablet, now, rand = Math.random }: CreateWorldOptions): World {
  const agents: Agent[] = lineUpPrey(count).map(({ kind, order }, id) => {
    const def = PREY_KINDS.find((k) => k.id === kind);
    if (!def) throw new Error(`[prey] unknown kind: ${kind}`);
    const scale = isTablet ? def.size.tablet : def.size.phone;
    return { id, kind, state: def.behavior.create({ field, isTablet, scale, now, rand, order }) };
  });
  return { agents, ripples: [], emptySince: null, lastNow: now, pointer: null };
}

/** 画面に見えている獲物がいるか。 */
export function isAnythingOnScreen(world: World, field: Field): boolean {
  'worklet';
  return world.agents.some((a) => PREY_BEHAVIORS[a.kind].isOnScreen(a.state, field));
}

function isEarlier(a: RecallRank, b: RecallRank): boolean {
  'worklet';
  return a.tier < b.tier || (a.tier === b.tier && a.order < b.order);
}

/**
 * 画面に何も見えない状態が callBackAfterEmptyMs 続いたら、隠れている獲物を 1 匹呼び戻す（FR4.5）。
 * 呼び戻す順番は、動きの部品の recallRank が決める。呼び戻したら true。
 */
export function keepPreyOnScreen(world: World, field: Field, now: number): boolean {
  'worklet';
  if (isAnythingOnScreen(world, field)) {
    world.emptySince = null;
    return false;
  }
  if (world.emptySince === null) {
    world.emptySince = now;
    return false;
  }
  if (now - world.emptySince < MOTION.callBackAfterEmptyMs) return false;

  // 次に呼び戻すまで、また同じだけ待つ
  world.emptySince = now;

  let chosen: Agent | null = null;
  let chosenRank: RecallRank | null = null;
  for (const a of world.agents) {
    const rank = PREY_BEHAVIORS[a.kind].recallRank(a.state, now);
    if (rank && (!chosenRank || isEarlier(rank, chosenRank))) {
      chosen = a;
      chosenRank = rank;
    }
  }
  if (!chosen) return false;
  PREY_BEHAVIORS[chosen.kind].recall(chosen.state, field, now);
  return true;
}

/** 全部を 1 フレーム進める。鳴らす音の合図を返す。 */
export function stepWorld(world: World, field: Field, now: number, rand: Rand = Math.random): SoundCue[] {
  'worklet';
  const dt = Math.max(0, Math.min(MAX_DT, (now - world.lastNow) / 1000));
  world.lastNow = now;
  const cues: SoundCue[] = [];
  for (const a of world.agents) {
    const b = PREY_BEHAVIORS[a.kind];
    if (b.watch) b.watch(a.state, world.pointer, now);
    const cue = b.step(a.state, field, now, dt, rand);
    if (cue) cues.push({ kind: a.kind, cue });
  }
  // 何も見えない時間が長くならないよう、隠れているものを呼び戻す
  keepPreyOnScreen(world, field, now);
  if (world.ripples.length > 0) world.ripples = world.ripples.filter((r) => now - r.start < RIPPLE_LIFE_MS);
  return cues;
}

/**
 * 触った（FR4.2・FR4.3）。当たり範囲の中の獲物は「捕まえた」（0.4 秒止まる）あと逃げる・引っ込む。
 * 当たったら、最初に当たった獲物の色の波紋を当てた場所に広げる。何もない所に触っても何も起きない。
 * 当たっていない獲物のうち、近くの指に気づく部品（react）を持つものには知らせる。
 */
export function touchWorld(world: World, p: Vec, field: Field, now: number, rand: Rand = Math.random): TouchResult {
  'worklet';
  world.pointer = { x: p.x, y: p.y, at: now };
  const cues: SoundCue[] = [];
  let hitKind: string | null = null;
  for (const a of world.agents) {
    const b = PREY_BEHAVIORS[a.kind];
    let cue: string | null = null;
    if (b.distanceTo(a.state, p) <= b.hitRadius(a.state)) {
      hitKind = hitKind ?? a.kind;
      cue = b.startle(a.state, p, field, now, rand);
    } else if (b.react) {
      cue = b.react(a.state, p, field, now, rand);
    }
    if (cue) cues.push({ kind: a.kind, cue });
  }
  if (hitKind !== null) world.ripples.push({ x: p.x, y: p.y, start: now, color: PREY_COLORS[hitKind] });
  return { hit: hitKind !== null, cues };
}

/** 指を動かした（FR なし。指の方を見る獲物のために、いちばん新しい指の位置だけを覚える）。 */
export function pointWorld(world: World, p: Vec, now: number): void {
  'worklet';
  world.pointer = { x: p.x, y: p.y, at: now };
}
