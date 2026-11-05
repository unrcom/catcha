/**
 * 確認ダイアログ（ログアウトの確認。FR1.3）。
 * 開いている間は外を操作できない。「やめる」が最初の操作対象で、戻る操作も「やめる」と同じ。
 */
import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { Button } from './controls';
import { colors, fontSize, spacing } from './theme';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
  testID?: string;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  busy = false,
  testID = 'confirm-dialog',
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} testID={testID}>
      <View style={styles.scrim}>
        <View style={styles.box} accessibilityViewIsModal accessibilityRole="alert">
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Button label={cancelLabel} onPress={onCancel} variant="secondary" testID={`${testID}-cancel`} />
            <Button label={confirmLabel} onPress={onConfirm} loading={busy} testID={`${testID}-confirm`} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', padding: spacing.lg },
  box: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  title: { fontSize: fontSize.title - 4, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  message: { fontSize: fontSize.body, color: colors.text, marginBottom: spacing.lg, lineHeight: 26 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md, flexWrap: 'wrap' },
});
