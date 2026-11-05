#!/usr/bin/env node
/**
 * 遊び画面の短い音を作る（FR2.6）。外部の音素材を使わず、計算で WAV（16bit・モノラル）を書き出す。
 *   teaser.wav  … 猫じゃらしが見えたとき・飛んだときの、ばねのような「ボヨーン」という音
 *   string.wav  … 紐が見えたときの、速く空を切る「シュッ」という音
 *   tail.wav    … しっぽが見えたときの、やわらかく丸い「ポワン」という音（猫じゃらしの「カサッ」と聞き分けやすいよう、雑音ではなく音程のある音）
 *   mouse-te.wav・mouse-ke.wav … ネズミの足音「テ」「ケ」。肉球のような、低めでやわらかい「ペタ」。足が地面につくたびに交互に鳴らし「テケテケ」にする
 *   startle.wav … 触られたときの、短い「チュッ」という高い音
 * 使い方：node scripts/make-sounds.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 22050;
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

function toWav(samples) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  samples.forEach((s, i) => {
    const clamped = Math.max(-1, Math.min(1, s));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  });
  return buf;
}

/** 決まった種から作る乱数（毎回同じ音になる） */
function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647 - 0.5;
  };
}

function chirp(durationSec = 0.12) {
  const n = Math.floor(SAMPLE_RATE * durationSec);
  let phase = 0;
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const freq = 2200 + 1800 * t; // 高い音から、さらに上がる
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    const envelope = Math.min(1, t * 20) * (1 - t) ** 2;
    return Math.sin(phase) * envelope * 0.45;
  });
}

/** 空を切る音。高い成分だけ残した雑音を、強くなってすっと消える形にする */
function swish(durationSec = 0.16) {
  const rand = seeded(7);
  const n = Math.floor(SAMPLE_RATE * durationSec);
  let prev = 0;
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const envelope = Math.min(1, t * 6) * (1 - t) ** 1.5;
    const noise = rand();
    const high = noise - prev; // 低い成分を削る
    prev = noise;
    return high * envelope * 0.35;
  });
}

/** やわらかく丸い音。低めの音程が少し下がりながら、ゆっくり消える */
function pon(durationSec = 0.22) {
  const n = Math.floor(SAMPLE_RATE * durationSec);
  let phase = 0;
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const freq = 520 - 220 * t + Math.sin(t * Math.PI * 6) * 12; // 少し揺れながら下がる
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    const envelope = Math.min(1, t * 25) * (1 - t) ** 2.2;
    return (Math.sin(phase) + Math.sin(phase * 2) * 0.25) * envelope * 0.32;
  });
}

/** 小さな足音1つ「ペタ」。低めの音程が少し下がる、肉球のようなやわらかい音（試聴ページの候補 C。from・to で「テ」と「ケ」を分ける） */
function step(from, to) {
  const n = Math.floor(SAMPLE_RATE * 0.05);
  let phase = 0;
  const raw = Array.from({ length: n }, (_, i) => {
    const t = i / n;
    phase += (2 * Math.PI * (from + (to - from) * t)) / SAMPLE_RATE;
    const envelope = Math.min(1, t / 0.25) * (1 - t) ** 2; // ゆっくり立ち上げて角を取る
    return Math.sin(phase) * envelope;
  });
  const peak = Math.max(...raw.map(Math.abs)) || 1;
  return raw.map((v) => (v / peak) * 0.35);
}

/** ばねが伸び縮みする「ボヨーン」。低めの音程が揺れながら下がり、ゆっくり消える */
function boing(durationSec = 0.55) {
  const n = Math.floor(SAMPLE_RATE * durationSec);
  let phase = 0;
  return Array.from({ length: n }, (_, i) => {
    const sec = i / SAMPLE_RATE;
    const t = i / n;
    const wobble = 1 + 0.28 * Math.exp(-sec * 4) * Math.sin(2 * Math.PI * 13 * sec);
    const freq = (170 + 140 * Math.exp(-sec * 7)) * wobble;
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    const envelope = Math.min(1, t * 40) * (1 - t) ** 1.6;
    return (Math.sin(phase) + Math.sin(phase * 2) * 0.3 + Math.sin(phase * 3) * 0.1) * envelope * 0.4;
  });
}

try {
  mkdirSync(outDir, { recursive: true });
  const files = {
    'teaser.wav': boing(),
    'string.wav': swish(),
    'tail.wav': pon(),
    'mouse-te.wav': step(420, 300),
    'mouse-ke.wav': step(360, 260),
    'startle.wav': chirp(),
  };
  for (const [name, samples] of Object.entries(files)) writeFileSync(join(outDir, name), toWav(samples));
  console.log(`wrote ${Object.keys(files).join(', ')} to ${outDir}`);
} catch (error) {
  console.error('could not write the sound files:', error);
  process.exit(1);
}
