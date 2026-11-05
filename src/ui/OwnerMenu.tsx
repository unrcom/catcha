/**
 * 飼い主メニュー（interaction-spec.md の OwnerMenu。FR3.2, FR4.5）
 * - 遊びの上に重ねる。タッチについてはモーダルではない：枠の外のタッチは後ろの遊び場に届く
 * - 読み上げ機能のフォーカスはメニューの中に閉じ込める（後ろの遊び場は読み上げの対象から外す）
 * - 残り秒数を文字で示す。自動で閉じる判定は遊びのきまり（playSession）が持つ
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatDuration, formatDurationSpoken } from '../domain/records';
import { Button } from './controls';
import { colors, fontSize, spacing } from './theme';

type Props = {
  playedMs: number;
  secondsLeft: number;
  onEnd: () => void;
  onResume: () => void;
};

export function OwnerMenu({ playedMs, secondsLeft, onEnd, onResume }: Props) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID="owner-menu-overlay">
      <View style={styles.center} pointerEvents="box-none">
        <View style={styles.box} accessibilityViewIsModal testID="owner-menu">
          <Text accessibilityRole="header" style={styles.title}>
            飼い主メニュー
          </Text>
          <Text
            style={styles.body}
            accessibilityLabel={`遊んだ時間 ${formatDurationSpoken(playedMs)}`}
            testID="owner-menu-played-time"
          >
            遊んだ時間　{formatDuration(playedMs)}
          </Text>
          <View style={styles.actions}>
            <Button label="遊びを終える" onPress={onEnd} variant="secondary" testID="owner-menu-end-button" />
            <Button label="遊びに戻る" onPress={onResume} testID="owner-menu-resume-button" />
          </View>
          <Text style={styles.caption} accessibilityLiveRegion="polite" testID="owner-menu-countdown">
            {secondsLeft}秒で遊びに戻ります
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  box: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    minWidth: 300,
    maxWidth: 440,
    gap: spacing.md,
  },
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.body, color: colors.text },
  actions: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  caption: { fontSize: fontSize.caption, color: colors.textMuted },
});
