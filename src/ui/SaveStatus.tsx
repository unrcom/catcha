/**
 * 保存状態の表示（interaction-spec.md の SaveStatus。FR5.2, FR7.1〜FR7.4, NFR6）。
 * すべての状態を文章で示し、失敗には印（!）も付ける。状態が変わったら読み上げる。
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, spacing } from './theme';

export type SaveStatusKind = 'saved' | 'pending' | 'failed' | 'retrying';

export const SAVE_STATUS_TEXT: Record<SaveStatusKind, string> = {
  saved: '記録しました',
  pending: '保存待ち（通信が戻ったら自動で送ります）',
  failed: '保存できていない記録があります',
  retrying: '送信中…',
};

type Props = {
  status: SaveStatusKind;
  /** 'result' は結果画面（暗い背景）、'home' はホーム */
  tone?: 'result' | 'home';
  /** 失敗のときに続けて出す説明 */
  failedDetail?: string;
  testID?: string;
};

export function SaveStatus({ status, tone = 'home', failedDetail, testID = 'save-status' }: Props) {
  const isFailed = status === 'failed';
  const text = isFailed && failedDetail ? `${SAVE_STATUS_TEXT.failed}。${failedDetail}` : SAVE_STATUS_TEXT[status];
  const textColor = tone === 'result' ? colors.resultText : isFailed ? colors.error : colors.text;
  return (
    <View style={styles.row} accessibilityLiveRegion="polite" accessible testID={testID} accessibilityLabel={text}>
      {isFailed ? (
        <Text style={[styles.mark, { borderColor: textColor, color: textColor }]} importantForAccessibility="no">
          !
        </Text>
      ) : null}
      <Text style={[styles.text, { color: textColor }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  mark: {
    borderWidth: 2,
    borderRadius: 12,
    width: 24,
    height: 24,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '700',
    fontSize: fontSize.caption,
  },
  text: { fontSize: fontSize.body, flexShrink: 1, textAlign: 'center' },
});
