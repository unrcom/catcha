/**
 * S5 遊びの結果（FR3.3, FR4.4, FR5.2, FR5.3, FR7.1〜FR7.3, NFR1）
 * - 暗めの画面に、遊んだ時間と保存状態。一度も触られなかったら「今回は遊びませんでした」
 * - ボタンは置かない。「α」を描いたときだけホームに戻る。それ以外の触り方では何も起きない
 */
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, BackHandler, StyleSheet, Text, View } from 'react-native';

import type { StrokeEnd } from '../src/domain/alphaGesture';
import { formatDuration, formatDurationSpoken } from '../src/domain/records';
import { useApp } from '../src/state/AppProvider';
import { clearLatestResult, getLatestResult } from '../src/state/resultStore';
import { SaveStatus, type SaveStatusKind } from '../src/ui/SaveStatus';
import { colors, fontSize, spacing } from '../src/ui/theme';
import { TouchSurface } from '../src/ui/TouchSurface';
import { useHideNavigationBar } from '../src/ui/useHideNavigationBar';

export default function ResultScreen() {
  const router = useRouter();
  const { services, userId } = useApp();
  const [result] = useState(() => getLatestResult());
  const [status, setStatus] = useState<SaveStatusKind | null>(null);
  const leaving = useRef(false);
  useHideNavigationBar();

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  // 1回の遊びを1件として保存する（同じ記録は二度送らない）
  useEffect(() => {
    if (!result?.recorded || !userId) return undefined;
    const { record } = result;
    let active = true;
    services.pending
      .save(userId, record)
      .then((s) => active && setStatus(s))
      .catch((error) => {
        console.error('[result] could not keep the record on the device', error);
        if (active) setStatus('failed');
      });
    const unsubscribe = services.pending.subscribe(() => {
      services.pending
        .statusOf(record.clientId)
        .then((s) => active && s && setStatus(s))
        .catch((error) => console.warn('[result] status check failed', error));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [result, services, userId]);

  function handleStroke(stroke: StrokeEnd) {
    if (!stroke.isAlpha || leaving.current) return;
    leaving.current = true;
    AccessibilityInfo.announceForAccessibility('ホームに戻ります');
    clearLatestResult();
    router.replace('/');
  }

  const played = result?.recorded ? result.record.durationMs : null;

  return (
    <TouchSurface style={styles.root} onStrokeEnd={handleStroke} testID="result-screen">
      {/* ネコの画面なので、時刻・電波・バッテリーも出さない */}
      <StatusBar hidden />
      <View style={styles.content} pointerEvents="none">
        <Text accessibilityRole="header" style={styles.heading}>
          遊びが終わりました
        </Text>
        {result && !result.recorded ? (
          <Text style={styles.message} testID="result-not-played">
            今回は遊びませんでした
          </Text>
        ) : null}
        {played !== null ? (
          <>
            <Text style={styles.time} accessibilityLabel={`遊んだ時間 ${formatDurationSpoken(played)}`} testID="result-time">
              {formatDuration(played)}
            </Text>
            {status ? (
              <SaveStatus
                status={status}
                tone="result"
                failedDetail="ホームの『再試行』で送り直せます"
                testID="result-save-status"
              />
            ) : null}
          </>
        ) : null}
        <Text style={styles.hint}>画面に指で「α」を描くとホームに戻ります</Text>
      </View>
    </TouchSurface>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.resultDim },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  heading: { fontSize: fontSize.title, color: colors.resultText, fontWeight: '600' },
  time: { fontSize: fontSize.resultTime, color: colors.resultText, fontWeight: '300' },
  message: { fontSize: fontSize.body + 4, color: colors.resultText },
  hint: { fontSize: fontSize.caption, color: colors.resultText, marginTop: spacing.xl },
});
