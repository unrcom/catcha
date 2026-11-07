/**
 * S3 遊び画面 ＋ S4 飼い主メニュー（FR2.1〜FR2.7, FR3.1, FR3.2, FR3.4, FR4.1〜FR4.5, FR5.1, NFR1, NFR2）
 * - 画面を暗くしない（expo-keep-awake）、始まった時点の向きで固定する
 * - 「α」でメニューを開く。「α」でない指の動きはネコのタッチとして数える
 * - 通信は使わない（通信が切れても遊びは止まらない）
 */
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, BackHandler, StyleSheet, Text, View } from 'react-native';

import type { StrokeEnd } from '../src/domain/alphaGesture';
import {
  catTouch,
  closeMenu,
  endByOwner,
  menuSecondsLeft,
  openMenu,
  outcomeOf,
  playedMs,
  startSession,
  tick,
  type PlaySession,
} from '../src/domain/playSession';
import { createClientId } from '../src/domain/records';
import { useApp } from '../src/state/AppProvider';
import { setLatestResult } from '../src/state/resultStore';
import { OwnerMenu } from '../src/ui/OwnerMenu';
import { PlayField } from '../src/ui/PlayField';
import { useHideNavigationBar } from '../src/ui/useHideNavigationBar';

const TICK_MS = 250;

function lockFor(orientation: ScreenOrientation.Orientation): ScreenOrientation.OrientationLock {
  switch (orientation) {
    case ScreenOrientation.Orientation.PORTRAIT_UP:
      return ScreenOrientation.OrientationLock.PORTRAIT_UP;
    case ScreenOrientation.Orientation.PORTRAIT_DOWN:
      return ScreenOrientation.OrientationLock.PORTRAIT_DOWN;
    case ScreenOrientation.Orientation.LANDSCAPE_LEFT:
      return ScreenOrientation.OrientationLock.LANDSCAPE_LEFT;
    case ScreenOrientation.Orientation.LANDSCAPE_RIGHT:
      return ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT;
    default:
      return ScreenOrientation.OrientationLock.DEFAULT;
  }
}

/** 遊んでいる間は、始まった時点の画面の向きで固定する。 */
function useOrientationLock() {
  useEffect(() => {
    ScreenOrientation.getOrientationAsync()
      .then((o) => ScreenOrientation.lockAsync(lockFor(o)))
      .catch((error) => console.warn('[play] could not lock orientation', error));
    return () => {
      ScreenOrientation.unlockAsync().catch((error) => console.warn('[play] could not unlock orientation', error));
    };
  }, []);
}

/** Android の戻るボタンで画面が移らないようにする（NFR1）。 */
function useBlockBackButton() {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);
}

export default function PlayScreen() {
  useKeepAwake();
  useHideNavigationBar();
  useOrientationLock();
  useBlockBackButton();

  const router = useRouter();
  const { settings } = useApp();
  const [session, setSession] = useState<PlaySession>(() => startSession(Date.now(), settings.idleSeconds));
  const sessionRef = useRef(session);
  const fingersDown = useRef(0);
  const finished = useRef(false);
  const [now, setNow] = useState(Date.now());

  const finish = useCallback(
    (ended: PlaySession) => {
      if (finished.current) return;
      finished.current = true;
      const outcome = outcomeOf(ended);
      setLatestResult(
        outcome.recorded
          ? { recorded: true, record: { clientId: createClientId(), playedAt: outcome.playedAt, durationMs: outcome.durationMs } }
          : { recorded: false },
      );
      router.replace('/result');
    },
    [router],
  );

  const update = useCallback(
    (next: (s: PlaySession) => PlaySession) => {
      const prev = sessionRef.current;
      const s = next(prev);
      if (s === prev) return;
      sessionRef.current = s;
      setSession(s);
      if (s.phase === 'ended') finish(s);
    },
    [finish],
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const t = Date.now();
      update((s) => tick(s, t, fingersDown.current > 0));
      if (sessionRef.current.phase === 'menu') setNow(t);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [update]);

  const handleStroke = useCallback(
    (stroke: StrokeEnd) => {
      const current = sessionRef.current;
      if (stroke.isAlpha) {
        // 「α」はネコのタッチに数えない。メニュー中・終了後の「α」は何もしない
        if (current.phase === 'waiting' || current.phase === 'playing') {
          const t = Date.now();
          setNow(t);
          update((s) => openMenu(s, t));
          AccessibilityInfo.announceForAccessibility('飼い主メニューを開きました');
        }
        return;
      }
      const first = stroke.points[0].t;
      const last = stroke.points[stroke.points.length - 1].t;
      update((s) => catTouch(catTouch(s, first), last));
    },
    [update],
  );

  const menuOpen = session.phase === 'menu';

  return (
    <View style={styles.root} testID="play-screen">
      {/* 時刻・電波・バッテリーも出さない（FR2.5） */}
      <StatusBar hidden />
      {/* 読み上げ用の見出しだけ（画面には表示しない） */}
      <Text accessibilityRole="header" style={styles.srOnly} testID="play-sr-heading">
        遊び中
      </Text>
      <PlayField
        background={settings.background}
        soundOn={settings.soundOn}
        preyCounts={settings.preyCounts}
        onStrokeEnd={handleStroke}
        onActiveCountChange={(n) => {
          fingersDown.current = n;
        }}
        hiddenFromAccessibility={menuOpen}
      />
      {menuOpen ? (
        <OwnerMenu
          playedMs={playedMs(session)}
          secondsLeft={menuSecondsLeft(session, now)}
          onEnd={() => update((s) => endByOwner(s, Date.now()))}
          onResume={() => update((s) => closeMenu(s, Date.now()))}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  srOnly: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' },
});
