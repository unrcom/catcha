/**
 * 画面の振り分け：ログインしていなければ S1/S1b、していればホーム以降。
 * 遊び画面と結果画面では、戻る操作（スワイプ・Android の戻るボタン）で画面が移らないようにする（NFR1）。
 */
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getSupabase, SupabaseConfigError } from '../src/data/supabase';
import { AppProvider, createDefaultServices, useApp, type AppServices } from '../src/state/AppProvider';
import { colors, fontSize, spacing } from '../src/ui/theme';

function RootStack() {
  const { ready, userId } = useApp();
  if (!ready) {
    return (
      <View style={styles.center} accessible accessibilityLabel="読み込み中">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  const signedIn = userId !== null;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
        <Stack.Screen name="guide" />
        <Stack.Screen name="play" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="result" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="records" />
      </Stack.Protected>
    </Stack>
  );
}

function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <View style={styles.center}>
      <Text accessibilityRole="header" style={styles.title}>
        設定が足りません
      </Text>
      <Text style={styles.body}>{message}</Text>
    </View>
  );
}

export default function RootLayout() {
  const created = useMemo<{ services: AppServices } | { error: string }>(() => {
    try {
      return { services: createDefaultServices() };
    } catch (error) {
      if (error instanceof SupabaseConfigError) return { error: error.message };
      throw error;
    }
  }, []);

  // アプリが前面にあるときだけ、ログインの期限を自動で延ばす（Supabase の推奨）
  useEffect(() => {
    if ('error' in created) return undefined;
    const client = getSupabase();
    client.auth.startAutoRefresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
    return () => sub.remove();
  }, [created]);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {'error' in created ? (
        <ConfigErrorScreen message={created.error} />
      ) : (
        <AppProvider services={created.services}>
          <RootStack />
        </AppProvider>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.surface },
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  body: { fontSize: fontSize.body, color: colors.text, textAlign: 'center' },
});
