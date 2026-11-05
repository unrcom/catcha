/**
 * S6 記録（FR6.1〜FR6.3, NFR6）
 * 新しい順の一覧、直近3回の平均、メモの編集、記録なし・読み込み中・エラーの表示。
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  formatDuration,
  formatDurationSpoken,
  formatPlayedAt,
  formatPlayedAtSpoken,
  MEMO_MAX_LENGTH,
  recentAverageMs,
  sortNewestFirst,
  type PlayRecord,
} from '../src/domain/records';
import { useApp } from '../src/state/AppProvider';
import { Button, ErrorMessage, Heading } from '../src/ui/controls';
import { colors, fontSize, MIN_TOUCH, spacing } from '../src/ui/theme';

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'loaded'; records: PlayRecord[] };

function SkeletonRows() {
  return (
    <View testID="records-loading" accessible accessibilityLabel="読み込み中">
      {[0, 1, 2].map((k) => (
        <View key={k} style={styles.skeletonRow}>
          <View style={[styles.skeletonBlock, { width: '45%' }]} />
          <View style={[styles.skeletonBlock, { width: '25%' }]} />
        </View>
      ))}
    </View>
  );
}

function MemoEditor({
  record,
  onCancel,
  onSave,
}: {
  record: PlayRecord;
  onCancel: () => void;
  onSave: (memo: string) => Promise<void>;
}) {
  const [memo, setMemo] = useState(record.memo ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(memo);
    } catch (e) {
      console.warn('[records] memo save failed', e);
      setError('保存できませんでした。もう一度お試しください');
      setSaving(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel} testID="memo-editor">
      <View style={styles.scrim}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={styles.dialogTitle} nativeID="memo-label">
            メモ
          </Text>
          <TextInput
            value={memo}
            onChangeText={setMemo}
            maxLength={MEMO_MAX_LENGTH}
            accessibilityLabel="メモ"
            accessibilityLabelledBy="memo-label"
            style={styles.input}
            testID="memo-input"
            autoFocus
          />
          <Text style={styles.caption}>例：どのネコが遊んだか</Text>
          {error ? <ErrorMessage message={error} testID="memo-error" /> : null}
          <View style={styles.dialogActions}>
            <Button label="やめる" onPress={onCancel} variant="secondary" testID="memo-cancel-button" />
            <Button label="保存" onPress={save} loading={saving} testID="memo-save-button" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function RecordsScreen() {
  const router = useRouter();
  const { services, userId } = useApp();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [editing, setEditing] = useState<PlayRecord | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setState({ kind: 'loading' });
    try {
      const records = await services.records.list(userId);
      setState({ kind: 'loaded', records: sortNewestFirst(records) });
    } catch (error) {
      console.warn('[records] load failed', error);
      setState({ kind: 'error' });
    }
  }, [services, userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveMemo(record: PlayRecord, memo: string) {
    if (!userId) return;
    const updated = await services.records.updateMemo(userId, record.id, memo);
    setState((s) =>
      s.kind === 'loaded' ? { kind: 'loaded', records: s.records.map((r) => (r.id === updated.id ? updated : r)) } : s,
    );
    setEditing(null);
  }

  function renderBody() {
    if (state.kind === 'loading') return <SkeletonRows />;
    if (state.kind === 'error') {
      return (
        <View style={styles.center} testID="records-error">
          <ErrorMessage message="記録を読み込めませんでした" />
          <Button label="再試行" onPress={load} variant="secondary" testID="records-retry-button" />
        </View>
      );
    }
    if (state.records.length === 0) {
      return (
        <View style={styles.center} testID="records-empty">
          <Text style={styles.body}>まだ記録がありません。ネコを遊ばせると、ここに遊んだ時間が残ります</Text>
          <Button label="ネコを遊ばせる" onPress={() => router.push('/guide')} testID="records-play-button" />
        </View>
      );
    }
    const average = recentAverageMs(state.records);
    return (
      <FlatList
        data={state.records}
        keyExtractor={(r) => r.id}
        accessibilityRole="list"
        testID="records-list"
        ListHeaderComponent={
          <View style={styles.average} testID="records-average">
            {average === null ? (
              <Text style={styles.body}>3回遊ぶと平均が表示されます</Text>
            ) : (
              <Text style={styles.body} accessibilityLabel={`直近3回の平均 ${formatDurationSpoken(average)}`}>
                直近3回の平均　<Text style={styles.strong}>{formatDuration(average)}</Text>
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row} testID={`records-item-${item.id}`}>
            <View
              style={styles.rowText}
              accessible
              accessibilityLabel={`${formatPlayedAtSpoken(item.playedAt)}、${formatDurationSpoken(item.durationMs)}${item.memo ? `、メモ ${item.memo}` : ''}`}
            >
              <View style={styles.rowTop}>
                <Text style={styles.body}>{formatPlayedAt(item.playedAt)}</Text>
                <Text style={[styles.body, styles.strong]}>{formatDuration(item.durationMs)}</Text>
              </View>
              <Text style={styles.memo}>{item.memo ? `メモ：${item.memo}` : 'メモを追加'}</Text>
            </View>
            <Button
              label="編集"
              onPress={() => setEditing(item)}
              variant="link"
              testID={`records-edit-${item.id}`}
              accessibilityHint="メモを編集します"
            />
          </View>
        )}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Button label="< 戻る" onPress={() => router.back()} variant="link" testID="records-back-button" />
        <Heading testID="records-heading">記録</Heading>
      </View>
      <View style={styles.content}>{renderBody()}</View>
      {editing ? (
        <MemoEditor record={editing} onCancel={() => setEditing(null)} onSave={(memo) => saveMemo(editing, memo)} />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  content: { flex: 1, paddingHorizontal: spacing.lg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  body: { fontSize: fontSize.body, color: colors.text },
  strong: { fontWeight: '700' },
  caption: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: spacing.xs },
  average: { paddingVertical: spacing.md, borderBottomWidth: 1, borderColor: colors.surfaceAlt },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderColor: colors.surfaceAlt,
    minHeight: MIN_TOUCH + spacing.md,
  },
  rowText: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', paddingRight: spacing.md },
  memo: { fontSize: fontSize.caption + 1, color: colors.textMuted, marginTop: spacing.xs },
  skeletonRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.md },
  skeletonBlock: { height: 18, borderRadius: 4, backgroundColor: colors.surfaceAlt },
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', padding: spacing.lg },
  dialog: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.lg, maxWidth: 480, width: '100%', alignSelf: 'center' },
  dialogTitle: { fontSize: fontSize.body + 2, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  input: {
    minHeight: MIN_TOUCH + 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.body,
    color: colors.text,
  },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md, marginTop: spacing.lg },
});
