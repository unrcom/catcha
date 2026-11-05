/**
 * S2a 遊ぶ前の案内（FR3.1、RF-Q1）
 * 「α」の描き方を線が描かれていく動きで見せ、5秒数えてから遊び画面へ。「すぐ始める」で待たずに入る。
 */
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Button, Heading } from '../src/ui/controls';
import { colors, fontSize, spacing } from '../src/ui/theme';

const GUIDE_COUNTDOWN_SECONDS = 5;

/**
 * 「α」の書き順の線。判定（src/domain/alphaGesture.ts）と同じ形：
 * 右下から書き始め、左側に左回り（反時計回り）の輪を描いて交差し、右上へ抜ける。
 * 結節点のある3次曲線 x = s²−1, y = −s(s²−1) を点に並べたもの。
 */
const GUIDE_POINTS = Array.from({ length: 41 }, (_, k) => {
  const s = -1.5 + (3 * k) / 40;
  return { x: 90 + 40 * (s * s - 1), y: 80 - 40 * s * (s * s - 1) * 0.85 };
});
const ALPHA_GUIDE_PATH = GUIDE_POINTS.map((p, k) => `${k === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
const PATH_LENGTH = Math.ceil(
  GUIDE_POINTS.reduce((sum, p, k) => (k === 0 ? 0 : sum + Math.hypot(p.x - GUIDE_POINTS[k - 1].x, p.y - GUIDE_POINTS[k - 1].y)), 0),
);

const AnimatedPath = Animated.createAnimatedComponent(Path);

function AlphaDrawing() {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => active && setReduceMotion(enabled))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.delay(600),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reduceMotion]);

  const dashOffset = progress.interpolate({ inputRange: [0, 1], outputRange: [PATH_LENGTH, 0] });
  return (
    <View accessible accessibilityLabel="右下から書き始め、左側に左回りの輪を描いて右上へ抜ける、一筆の「α」の描き方" testID="guide-alpha-animation">
      <Svg width={170} height={160} viewBox="0 0 170 160">
        <Path d={ALPHA_GUIDE_PATH} stroke={colors.surfaceAlt} strokeWidth={10} fill="none" strokeLinecap="round" />
        <AnimatedPath
          d={ALPHA_GUIDE_PATH}
          stroke={colors.primary}
          strokeWidth={10}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${PATH_LENGTH}`}
          strokeDashoffset={dashOffset}
        />
      </Svg>
    </View>
  );
}

export default function GuideScreen() {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(GUIDE_COUNTDOWN_SECONDS);
  const started = useRef(false);

  const start = () => {
    if (started.current) return;
    started.current = true;
    router.replace('/play');
  };

  useEffect(() => {
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (secondsLeft === 0) start();
    // start は ref で一度きりにしているので、依存に入れなくてよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Button label="< 戻る" onPress={() => router.back()} variant="link" testID="guide-back-button" />
      </View>
      <View style={styles.content}>
        <Heading testID="guide-heading">遊ぶ前に</Heading>
        <Text style={styles.body}>遊び中に終えるときは、画面に指で「α」を描いてください</Text>
        <AlphaDrawing />
        <Text style={styles.body}>端末を床に置いてください。</Text>
        <View style={styles.row}>
          <Text style={styles.body} accessibilityLiveRegion="polite" testID="guide-countdown">
            {secondsLeft} 秒後に始まります
          </Text>
          <Button label="すぐ始める" onPress={start} testID="guide-start-button" />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  topBar: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, alignItems: 'flex-start' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.lg },
  body: { fontSize: fontSize.body, color: colors.text, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap', justifyContent: 'center' },
});
