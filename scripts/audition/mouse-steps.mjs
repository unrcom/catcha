#!/usr/bin/env node
/**
 * ネズミの足音の候補を作り、聞き比べるページ（scripts/audition/mouse-steps.html）を書き出す。
 * 各候補は「テ」「ケ」の2つ。選んだ候補は make-sounds.mjs の step に移す。
 * 使い方：node scripts/audition/mouse-steps.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 22050;
const outFile = join(dirname(fileURLToPath(import.meta.url)), 'mouse-steps.html');

function toWav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2));
  return buf;
}
function seeded(seed) { let x = seed; return () => { x = (x * 16807) % 2147483647; return x / 2147483647 - 0.5; }; }
function normalize(raw, level) { const pk = Math.max(...raw.map(Math.abs)) || 1; return raw.map((v) => (v / pk) * level); }
const len = (sec) => Math.floor(SR * sec);

/** 音程のある短い音。freq から end へ音程を動かす。attack は立ち上がりの速さ */
function tone({ freq, end = freq, sec, attack = 0.15, decay = 2, harmonics = [], level = 0.3 }) {
  const n = len(sec); let ph = 0;
  return normalize(Array.from({ length: n }, (_, i) => {
    const t = i / n; ph += (2 * Math.PI * (freq + (end - freq) * t)) / SR;
    const env = Math.min(1, t / attack) * (1 - t) ** decay;
    return (Math.sin(ph) + harmonics.reduce((a, h, k) => a + Math.sin(ph * (k + 2)) * h, 0)) * env;
  }), level);
}
/** 雑音を帯域で絞った短い音。lowCut より低い所を削り、highCut より高い所を削る */
function noise({ seed, sec, lowCut = 0, highCut = 8000, attack = 0.2, decay = 2, level = 0.3 }) {
  const r = seeded(seed); const n = len(sec);
  const a = Math.exp((-2 * Math.PI * highCut) / SR); const b = Math.exp((-2 * Math.PI * Math.max(1, lowCut)) / SR);
  let lp = 0, lp2 = 0, base = 0;
  return normalize(Array.from({ length: n }, (_, i) => {
    const t = i / n; lp = lp * a + r() * (1 - a); lp2 = lp2 * a + lp * (1 - a);
    base = base * b + lp2 * (1 - b); const v = lowCut ? lp2 - base : lp2;
    return v * Math.min(1, t / attack) * (1 - t) ** decay;
  }), level);
}

const candidates = [
  { id: 'A', name: 'いまの音（やわらかい息）', note: 'こもらせた雑音をなめらかに鳴らす', te: noise({ seed: 5, sec: 0.035, highCut: 2200, attack: 0.5, decay: 1 }), ke: noise({ seed: 6, sec: 0.035, highCut: 1700, attack: 0.5, decay: 1 }) },
  { id: 'B', name: 'ポッ（水滴）', note: '音程が少し上がる、丸くかわいい音', te: tone({ freq: 900, end: 1500, sec: 0.04, attack: 0.1, decay: 2.5 }), ke: tone({ freq: 750, end: 1250, sec: 0.04, attack: 0.1, decay: 2.5 }) },
  { id: 'C', name: 'ペタ（肉球）', note: '低めでやわらかく、少しだけ湿った音', te: tone({ freq: 420, end: 300, sec: 0.05, attack: 0.25, decay: 2, level: 0.35 }), ke: tone({ freq: 360, end: 260, sec: 0.05, attack: 0.25, decay: 2, level: 0.35 }) },
  { id: 'D', name: 'カサ（紙の上）', note: '高い所だけの、ごく短いこすれる音', te: noise({ seed: 7, sec: 0.025, lowCut: 3000, highCut: 9000, attack: 0.15, decay: 2.5, level: 0.22 }), ke: noise({ seed: 8, sec: 0.025, lowCut: 2500, highCut: 7000, attack: 0.15, decay: 2.5, level: 0.22 }) },
  { id: 'E', name: 'チャッ（小さな爪）', note: '細く高い、ごく小さな音', te: noise({ seed: 9, sec: 0.012, lowCut: 4000, highCut: 10000, attack: 0.05, decay: 3, level: 0.2 }), ke: noise({ seed: 10, sec: 0.012, lowCut: 3500, highCut: 9000, attack: 0.05, decay: 3, level: 0.2 }) },
  { id: 'F', name: 'ピコ（おもちゃ）', note: '高い電子音。ゲームの小さな足音', te: tone({ freq: 2000, sec: 0.03, attack: 0.05, decay: 1.5, level: 0.18 }), ke: tone({ freq: 1600, sec: 0.03, attack: 0.05, decay: 1.5, level: 0.18 }) },
  { id: 'G', name: 'ポン（マリンバ）', note: '木琴のやわらかい高い音', te: tone({ freq: 1320, sec: 0.08, attack: 0.03, decay: 4, harmonics: [0, 0.25], level: 0.25 }), ke: tone({ freq: 1100, sec: 0.08, attack: 0.03, decay: 4, harmonics: [0, 0.25], level: 0.25 }) },
  { id: 'H', name: 'トッ（前の音）', note: '木をたたくような音（比べる用）', te: tone({ freq: 1100, end: 770, sec: 0.045, attack: 0.02, decay: 4, level: 0.35 }), ke: tone({ freq: 760, end: 530, sec: 0.045, attack: 0.02, decay: 4, level: 0.35 }) },
];

const data = candidates.map((c) => ({ ...c, te: toWav(c.te).toString('base64'), ke: toWav(c.ke).toString('base64') }));
const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ネズミの足音</title>
<style>
:root{--bg:#fafaf7;--card:#fff;--text:#222;--muted:#666;--line:#e3e1da;--accent:#2f6fdb}
@media (prefers-color-scheme:dark){:root{--bg:#1b1b1a;--card:#262624;--text:#eee;--muted:#aaa;--line:#3a3936;--accent:#7aa7ff}}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 -apple-system,"Hiragino Sans",sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}p.lead{color:var(--muted);margin:0 0 16px}
.speed{display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:10px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.id{font-weight:700;font-size:20px;width:28px}.info{flex:1;min-width:180px}.name{font-weight:600}.note{color:var(--muted);font-size:14px}
button{font:inherit;border:1px solid var(--line);background:var(--bg);color:var(--text);border-radius:8px;padding:8px 12px;cursor:pointer}
button.main{background:var(--accent);color:#fff;border-color:var(--accent)}
</style></head><body><main>
<h1>ネズミの足音を選ぶ</h1>
<p class="lead">「テケテケ」で、走っているときの速さ（1秒に約9歩）で鳴らします。気に入ったものの記号（A〜H）を教えてください。</p>
<div class="speed">速さ：<button data-rate="9">走る（1秒に9歩）</button><button data-rate="26">逃げる（1秒に16歩まで）</button><button data-rate="4">ゆっくり（1秒に4歩）</button><span id="rate">走る</span></div>
<div id="list"></div>
</main><script>
const data=${JSON.stringify(data)};
let rate=9;const ctx=new (window.AudioContext||window.webkitAudioContext)();const buffers={};
async function buf(b64){if(buffers[b64])return buffers[b64];const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));return buffers[b64]=await ctx.decodeAudioData(bin.buffer);}
async function play(c,steps){await ctx.resume();const gap=1/Math.min(rate,16);const te=await buf(c.te),ke=await buf(c.ke);const t0=ctx.currentTime+0.05;for(let i=0;i<steps;i++){const s=ctx.createBufferSource();s.buffer=i%2?ke:te;s.connect(ctx.destination);s.start(t0+i*gap);}}
const list=document.getElementById('list');
for(const c of data){const d=document.createElement('div');d.className='card';d.innerHTML='<div class="id">'+c.id+'</div><div class="info"><div class="name">'+c.name+'</div><div class="note">'+c.note+'</div></div>';
const b1=document.createElement('button');b1.className='main';b1.textContent='テケテケ';b1.onclick=()=>play(c,12);
const b2=document.createElement('button');b2.textContent='1歩';b2.onclick=()=>play(c,1);d.append(b1,b2);list.append(d);}
document.querySelectorAll('[data-rate]').forEach(b=>b.onclick=()=>{rate=+b.dataset.rate;document.getElementById('rate').textContent=b.textContent.split('（')[0];});
</script></body></html>`;
writeFileSync(outFile, html);
console.log('wrote', outFile);
