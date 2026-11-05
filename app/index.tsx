/**
 * S2 ホーム（FR1.3, FR2.6, FR4.2, FR7.3, FR7.4, NFR6）
 * - 「ネコを遊ばせる」「記録を見る」と遊びの設定
 * - 保存できていない記録の帯と「再試行」
 * - 送れていない記録があるときだけ、ログアウトの確認を出す
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useApp } from '../src/state/AppProvider';
import { ConfirmDialog } from '../src/ui/ConfirmDialog';
import { Button, ErrorMessage, Heading } from '../src/ui/controls';
import { PlaySettings } from '../src/ui/PlaySettings';
import { SaveStatus } from '../src/ui/SaveStatus';
import { APP_NAME, colors, fontSize, PLAY_BUTTON_HEIGHT, spacing } from '../src/ui/theme';

type RetryState = 'idle' | 'retrying' | 'success' | 'error';

const SUCCESS_MESSAGE_MS = 3000;

export default function HomeScreen() {
  const router = useRouter();
  const { services, userId, setUserId, settings, updateSettings } = useApp();
  const { width, height } = useWindowDimensions();
  const twoColumns = width >= 768 && width > height;

  const [pendingCount, setPendingCount] = useState(0);
  const [hasFailed, setHasFailed] = useState(false);
  const [retryState, setRetryState] = useState<RetryState>('idle');
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshPending = useCallback(async () => {
    if (!userId) return;
    try {
      setPendingCount(await services.pending.count(userId));
      setHasFailed(await services.pending.hasFailed(userId));
    } catch (error) {
      console.warn('[home] could not read pending records', error);
    }
  }, [services, userId]);

  useEffect(() => {
    refreshPending();
    const unsubscribe = services.pending.subscribe(() => {
      refreshPending();
    });
    return () => {
      unsubscribe();
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, [services, refreshPending]);

  async function retry() {
    if (!userId) return;
    setRetryState('retrying');
    try {
      const result = await services.pending.retry(userId);
      await refreshPending();
      if (result.attempted && result.remaining === 0) {
        setRetryState('success');
        successTimer.current = setTimeout(() => setRetryState('idle'), SUCCESS_MESSAGE_MS);
      } else {
        setRetryState('error');
      }
    } catch (error) {
      console.warn('[home] retry failed', error);
      setRetryState('error');
    }
  }

  async function logout() {
    setLoggingOut(true);
    setLogoutError(null);
    const result = await services.auth.signOut();
    if (!result.ok) {
      setLoggingOut(false);
      setConfirmVisible(false);
      setLogoutError(result.message);
      return;
    }
    try {
      await services.pending.clearAll();
    } catch (error) {
      console.error('[home] could not clear pending records on logout', error);
    }
    setLoggingOut(false);
    setConfirmVisible(false);
    setUserId(null);
    router.replace('/login');
  }

  async function onLogoutPress() {
    if (!userId) return;
    const count = await services.pending.count(userId);
    setPendingCount(count);
    if (count > 0) setConfirmVisible(true);
    else await logout();
  }

  async function changeSettings(patch: Parameters<typeof updateSettings>[0]) {
    setSettingsError(null);
    try {
      await updateSettings(patch);
    } catch (error) {
      console.warn('[home] could not save settings', error);
      setSettingsError('設定を保存できませんでした。もう一度お試しください');
    }
  }

  const showBanner = hasFailed || retryState === 'success';

  return (
    <SafeAreaView style={styles.safe}>
      {/* 見出し・お知らせ・ボタン・設定をまとめてスクロールする（スマートフォンで設定の場所が狭くならないように） */}
      <ScrollView contentContainerStyle={styles.scroll} testID="home-scroll">
        <View style={styles.header}>
          <View>
            <Text style={styles.appName}>{APP_NAME}</Text>
            <Heading testID="home-heading">ホーム</Heading>
          </View>
          <Button label="ログアウト" onPress={onLogoutPress} variant="link" testID="home-logout-button" />
        </View>

        {showBanner ? (
          <View style={[styles.banner, hasFailed ? styles.bannerError : styles.bannerOk]} testID="home-unsent-banner">
            {retryState === 'success' && !hasFailed ? (
              <SaveStatus status="saved" testID="home-retry-success" />
            ) : (
              <>
                <View style={styles.bannerText}>
                  <SaveStatus status={retryState === 'retrying' ? 'retrying' : 'failed'} testID="home-unsent-status" />
                  {retryState === 'error' ? (
                    <ErrorMessage message="送れませんでした。通信状態を確認してください" testID="home-retry-error" />
                  ) : null}
                </View>
                <Button
                  label="再試行"
                  onPress={retry}
                  variant="secondary"
                  disabled={retryState === 'retrying'}
                  testID="home-retry-button"
                />
              </>
            )}
          </View>
        ) : null}

        {logoutError ? <ErrorMessage message={logoutError} testID="home-logout-error" /> : null}

        <View style={[styles.content, twoColumns && styles.contentRow]}>
          <View style={[styles.column, twoColumns && styles.columnHalf]}>
            <Button
              label="ネコを遊ばせる"
              onPress={() => router.push('/guide')}
              testID="home-play-button"
              style={styles.playButton}
            />
            <Button label="記録を見る" onPress={() => router.push('/records')} variant="secondary" testID="home-records-button" />
          </View>
          <View style={[styles.column, twoColumns && styles.columnHalf]}>
            <PlaySettings settings={settings} onChange={changeSettings} />
            {settingsError ? <ErrorMessage message={settingsError} testID="home-settings-error" /> : null}
          </View>
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={confirmVisible}
        title="ログアウトしますか？"
        message={`送れていない記録が ${pendingCount} 件あります。ログアウトすると、この記録は消えます。`}
        cancelLabel="やめる"
        confirmLabel="消してログアウト"
        onCancel={() => setConfirmVisible(false)}
        onConfirm={logout}
        busy={loggingOut}
        testID="logout-confirm"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingTop: spacing.md, gap: spacing.lg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  appName: { fontSize: fontSize.appName, color: colors.textMuted, fontWeight: '700' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  bannerError: { backgroundColor: colors.errorSurface, borderColor: colors.error },
  bannerOk: { backgroundColor: colors.surfaceAlt, borderColor: colors.success },
  bannerText: { flex: 1 },
  content: { gap: spacing.lg },
  contentRow: { flexDirection: 'row' },
  column: { gap: spacing.md },
  columnHalf: { flex: 1 },
  playButton: { minHeight: PLAY_BUTTON_HEIGHT },
});
