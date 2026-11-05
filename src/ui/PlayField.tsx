/**
 * 遊び場（interaction-spec.md の PlayField。FR2.1〜FR2.6）
 * - 紐・しっぽ・猫じゃらし（タブレットもスマートフォンも3本。スマートフォンは太く大きく）とときどき出るネズミを動かす
 * - 触られた紐・しっぽ・ネズミは跳ねて逃げ、猫じゃらしは引っ込んで消える。何もない所に触っても何も起きない
 * - 動き方は toyMotion.ts（画面の外に出ていったものは描かない）
 * - 複数の指を別々に扱う。ボタンや文字は出さない
 * - 指が離れたら、その指の軌跡（「α」かどうか）を親に渡す
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

import type { Point, StrokeEnd } from '../domain/alphaGesture';
import type { Background } from '../data/settingsStore';
import { TABLET_MIN_SIDE, toyPalette } from './theme';
import { TouchSurface } from './TouchSurface';
import {
  createMouse,
  createToys,
  distanceToToy,
  hitRadius,
  isMouseOnScreen,
  isToyOnScreen,
  isToyVisible,
  keepSomethingOnScreen,
  MOTION,
  startle,
  startleMouse,
  stepMouse,
  stepToy,
  type EmptyWatch,
  type Mouse,
  type Toy,
  type ToyKind,
} from './toyMotion';
import { useToySounds } from './useToySounds';

type Props = {
  background: Background;
  soundOn: boolean;
  onStrokeEnd: (stroke: StrokeEnd) => void;
  onActiveCountChange?: (count: number) => void;
  /** 飼い主メニューを開いている間は、読み上げの対象から外す */
  hiddenFromAccessibility?: boolean;
};

/** ネズミの当たる範囲（大きさ1のとき） */
const MOUSE_HIT_RADIUS = 48;

/** ネコが当てた場所に広がる波紋。 */
type Ripple = { x: number; y: number; start: number; color: string };
const RIPPLE_MS = 700;
const RIPPLE_RINGS = [0, 0.22, 0.44]; // 少しずつ遅れて広がる3つの輪

function RippleShape({ ripple, now }: { ripple: Ripple; now: number }) {
  return (
    <G>
      {RIPPLE_RINGS.map((delay, i) => {
        const t = (now - ripple.start) / RIPPLE_MS - delay;
        if (t <= 0 || t >= 1) return null;
        const eased = 1 - (1 - t) * (1 - t); // はじめ速く、だんだんゆっくり広がる
        return (
          <Circle
            key={i}
            cx={ripple.x}
            cy={ripple.y}
            r={10 + eased * 70}
            fill="none"
            stroke={ripple.color}
            strokeWidth={4 * (1 - t) + 1}
            opacity={1 - t}
          />
        );
      })}
    </G>
  );
}

function toyPath(toy: Toy): string {
  return toy.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

const PUFF_STRANDS = 10;

/** 猫じゃらしの先のふさ。細い毛を放射状に描き、少しずつ揺らす。 */
function TeaserPuff({ toy, width }: { toy: Toy; width: number }) {
  const tip = toy.points[0];
  const next = toy.points[1] ?? tip;
  const base = Math.atan2(tip.y - next.y, tip.x - next.x); // 軸の向き（ふさは先の方へ広がる）
  const sway = Math.sin((toy.teaser?.clock ?? 0) * 9) * 0.25;
  const size = width * MOTION.teaserPuffScale;
  const len = size * 6;
  const strands = Array.from({ length: PUFF_STRANDS }, (_, i) => {
    const a = base + sway + ((i / (PUFF_STRANDS - 1)) - 0.5) * 2.4;
    const l = len * (0.75 + 0.25 * Math.sin(i * 1.7));
    return `M ${tip.x.toFixed(1)} ${tip.y.toFixed(1)} L ${(tip.x + Math.cos(a) * l).toFixed(1)} ${(tip.y + Math.sin(a) * l).toFixed(1)}`;
  }).join(' ');
  return (
    <G>
      <Path d={strands} stroke={toy.color} strokeWidth={Math.max(2, size * 0.6)} fill="none" strokeLinecap="round" />
      <Circle cx={tip.x} cy={tip.y} r={size * 1.6} fill={toy.color} />
    </G>
  );
}

function ToyShape({ toy, outline }: { toy: Toy; outline: string | null }) {
  const d = toyPath(toy);
  const startled = toy.startledUntil > Date.now();
  const width = startled ? toy.width * 1.3 : toy.width; // 「ビクッ」と少し膨らむ
  // 猫じゃらしの軸は、ふさより細い線にする
  const stemWidth = toy.kind === 'teaser' ? Math.max(2, width * 0.5) : width;
  return (
    <G>
      {outline ? <Path d={d} stroke={outline} strokeWidth={stemWidth + 4} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
      <Path d={d} stroke={toy.color} strokeWidth={stemWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {toy.kind === 'teaser' ? <TeaserPuff toy={toy} width={width} /> : null}
    </G>
  );
}

/** 足の付け根（体の中心から見た位置。右向きのとき）と、前後に振る調子（対角の足が同じ向きに動く） */
const MOUSE_LEGS = [
  { x: 14, phase: 0 }, // 前足（手前）
  { x: -14, phase: Math.PI }, // 後ろ足（手前）
  { x: 18, phase: Math.PI }, // 前足（奥）
  { x: -10, phase: 0 }, // 後ろ足（奥）
];

/**
 * ネズミ。右向きに描いて、進む向きへ回す（左へ進むときは左右を反転）。
 * 足は走った道のり（stride）に合わせて前後に振るので、止まっている間は動かない。
 */
function MouseShape({ mouse, color, outline }: { mouse: Mouse; color: string; outline: string | null }) {
  if (!mouse.active) return null;
  const { x, y, dir, angle, stride } = mouse;
  const k = mouse.size;
  const stroke = outline ?? undefined;
  const outlineWidth = outline ? 2 * k : 0;
  // 左向きは反転して描くので、傾きは反転した向きから見た角度にする
  const tilt = ((dir === 1 ? angle : Math.PI - angle) * 180) / Math.PI;
  const swingPhase = (stride / (MOTION.mouseStepLength * k)) * Math.PI * 2;
  const legLength = 13 * k;
  return (
    <G transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${dir} 1) rotate(${tilt.toFixed(1)})`}>
      {MOUSE_LEGS.map((leg, i) => {
        const swing = Math.sin(swingPhase + leg.phase) * 0.7;
        const hipX = leg.x * k;
        const hipY = 8 * k;
        return (
          <Path
            key={i}
            d={`M ${hipX.toFixed(1)} ${hipY.toFixed(1)} L ${(hipX + Math.sin(swing) * legLength).toFixed(1)} ${(hipY + Math.cos(swing) * legLength).toFixed(1)}`}
            stroke={color}
            strokeWidth={4 * k}
            strokeLinecap="round"
            opacity={i >= 2 ? 0.7 : 1}
          />
        );
      })}
      <Path d={`M ${-26 * k} 0 Q ${-50 * k} ${-18 * k} ${-70 * k} ${4 * k}`} stroke={color} strokeWidth={4 * k} fill="none" strokeLinecap="round" />
      <Ellipse cx={0} cy={0} rx={28 * k} ry={16 * k} fill={color} stroke={stroke} strokeWidth={outlineWidth} />
      <Circle cx={24 * k} cy={-4 * k} r={11 * k} fill={color} stroke={stroke} strokeWidth={outlineWidth} />
      <Circle cx={20 * k} cy={-16 * k} r={6 * k} fill={color} stroke={stroke} strokeWidth={outlineWidth} />
    </G>
  );
}

export function PlayField({ background, soundOn, onStrokeEnd, onActiveCountChange, hiddenFromAccessibility = false }: Props) {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= TABLET_MIN_SIDE;
  const palette = toyPalette(background);
  const sounds = useToySounds(soundOn);
  const field = useRef({ width, height });
  field.current = { width, height };

  const toys = useRef<Toy[] | null>(null);
  if (toys.current === null) {
    // スマートフォンでも猫じゃらしを出す（動作確認のときの依頼）。スマートフォンは太く大きく描く
    const kinds: ToyKind[] = ['string', 'tail', 'teaser'];
    toys.current = createToys(field.current, { kinds, colors: palette.toys, isTablet, now: Date.now() });
  }
  // スマートフォンのネズミは、タブレットより小さく描く
  const mouse = useRef<Mouse>(createMouse(Date.now(), Math.random, isTablet ? MOTION.mouseScale : MOTION.phoneMouseScale));
  const emptyWatch = useRef<EmptyWatch>({ emptySince: null });
  const ripples = useRef<Ripple[]>([]);
  // 画面に見えていたか（見えていない → 見えたときに「カサッ」と鳴らす）
  const wasOnScreen = useRef<{ toys: boolean[] }>({ toys: [] });
  // ネズミの足が地面につくたび（足の1往復の半分ごと）に足音を鳴らす（走った道のりで数える）
  const lastStepCount = useRef(0);
  const [, setFrame] = useState(0);

  useEffect(() => {
    const colors = toyPalette(background).toys;
    toys.current?.forEach((toy, i) => {
      toy.color = colors[i % colors.length];
    });
  }, [background]);

  useEffect(() => {
    let raf = 0;
    let last = Date.now();
    const loop = () => {
      const now = Date.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const seen = wasOnScreen.current;
      toys.current?.forEach((toy, i) => {
        // 猫じゃらしが素早く飛び始めたとき
        if (stepToy(toy, field.current, now, dt)) sounds.playMove(toy.kind);
        // 画面に入ってきて、見えたとき
        const onScreen = isToyOnScreen(toy, field.current);
        if (onScreen && !seen.toys[i]) sounds.playMove(toy.kind);
        seen.toys[i] = onScreen;
      });
      stepMouse(mouse.current, field.current, now, dt);
      const stepCount = Math.floor(mouse.current.stride / ((MOTION.mouseStepLength * mouse.current.size) / 2));
      if (stepCount !== lastStepCount.current && isMouseOnScreen(mouse.current, field.current)) sounds.playStep();
      lastStepCount.current = stepCount;
      // 何も見えない時間が長くならないよう、隠れているものを呼び戻す
      if (toys.current) keepSomethingOnScreen(toys.current, mouse.current, field.current, now, emptyWatch.current);
      if (ripples.current.length > 0) {
        ripples.current = ripples.current.filter((r) => now - r.start < RIPPLE_MS * (1 + RIPPLE_RINGS[RIPPLE_RINGS.length - 1]));
      }
      setFrame((f) => (f + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sounds]);

  function handleTouchDown(p: Point) {
    const now = Date.now();
    let hitColor: string | null = null;
    toys.current?.forEach((toy) => {
      if (distanceToToy(toy, p) <= hitRadius(toy)) {
        hitColor = hitColor ?? toy.color;
        startle(toy, p, field.current, now);
      }
    });
    const m = mouse.current;
    if (m.active && Math.hypot(m.x - p.x, m.y - p.y) <= MOUSE_HIT_RADIUS * m.size) {
      hitColor = hitColor ?? palette.mouse;
      startleMouse(m, now);
    }
    if (hitColor) {
      // 当てた場所に、当てたものの色の波紋を広げる
      ripples.current.push({ x: p.x, y: p.y, start: now, color: hitColor });
      sounds.playStartle();
    }
  }

  return (
    <TouchSurface
      style={[StyleSheet.absoluteFill, { backgroundColor: palette.background }]}
      onTouchDown={handleTouchDown}
      onStrokeEnd={onStrokeEnd}
      onActiveCountChange={onActiveCountChange}
      hiddenFromAccessibility={hiddenFromAccessibility}
      testID="play-field"
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={width} height={height}>
          {toys.current.map((toy, i) =>
            isToyVisible(toy) ? <ToyShape key={i} toy={toy} outline={palette.outline} /> : null,
          )}
          <MouseShape mouse={mouse.current} color={palette.mouse} outline={palette.outline} />
          {ripples.current.map((ripple, i) => (
            <RippleShape key={`${ripple.start}-${i}`} ripple={ripple} now={Date.now()} />
          ))}
        </Svg>
      </View>
    </TouchSurface>
  );
}
