/**
 * アプリ全体で使う状態と部品（ログイン中のアカウント、遊びの設定、保存とやりとりの部品）。
 * 部品は外から渡せるので、テストでは偽物を渡す。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { createAuthRepository, type AuthRepository } from '../data/authRepository';
import { netInfoNetwork, type NetworkStatus } from '../data/network';
import { PendingQueue, startAutoRetry } from '../data/pendingQueue';
import { createRecordRepository, type RecordRepository } from '../data/recordRepository';
import {
  createSettingsStore,
  DEFAULT_SETTINGS,
  type PlaySettings,
  type SettingsStore,
} from '../data/settingsStore';
import { getSupabase } from '../data/supabase';

export type AppServices = {
  auth: AuthRepository;
  records: RecordRepository;
  pending: PendingQueue;
  settingsStore: SettingsStore;
  network: NetworkStatus;
};

/** 本番の部品を作る。Supabase の設定がなければ SupabaseConfigError を投げる。 */
export function createDefaultServices(): AppServices {
  const client = getSupabase();
  const records = createRecordRepository(client);
  return {
    auth: createAuthRepository(client),
    records,
    pending: new PendingQueue({
      storage: AsyncStorage,
      send: (userId, record) => records.save(userId, record),
      isOnline: () => netInfoNetwork.isOnline(),
    }),
    settingsStore: createSettingsStore(),
    network: netInfoNetwork,
  };
}

type AppContextValue = {
  services: AppServices;
  ready: boolean;
  userId: string | null;
  setUserId: (userId: string | null) => void;
  settings: PlaySettings;
  updateSettings: (patch: Partial<PlaySettings>) => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ services, children }: { services: AppServices; children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [settings, setSettings] = useState<PlaySettings>({ ...DEFAULT_SETTINGS });

  useEffect(() => {
    let active = true;
    services.auth
      .getCurrentUserId()
      .then((id) => active && setUserId(id))
      .catch((error) => console.warn('[app] could not restore session', error))
      .finally(() => active && setAuthReady(true));
    const unsubscribe = services.auth.onUserChange((id) => active && setUserId(id));
    services.settingsStore
      .load()
      .then((loaded) => active && setSettings(loaded))
      .catch((error) => console.warn('[app] could not load settings', error))
      .finally(() => active && setSettingsReady(true));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [services]);

  // ログイン中は、送れていない記録を自動で送り直す（FR7.2）
  useEffect(() => {
    if (!userId) return undefined;
    return startAutoRetry(services.pending, { userId, network: services.network });
  }, [services, userId]);

  const updateSettings = useCallback(
    async (patch: Partial<PlaySettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      await services.settingsStore.save(next);
    },
    [services, settings],
  );

  const value = useMemo<AppContextValue>(
    () => ({ services, ready: authReady && settingsReady, userId, setUserId, settings, updateSettings }),
    [services, authReady, settingsReady, userId, settings, updateSettings],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppProvider>');
  return value;
}
