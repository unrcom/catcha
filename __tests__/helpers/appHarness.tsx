import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Point } from '../../src/domain/alphaGesture';
import type { NewRecord, PlayRecord } from '../../src/domain/records';
import type { AuthRepository } from '../../src/data/authRepository';
import type { NetworkStatus } from '../../src/data/network';
import { PendingQueue } from '../../src/data/pendingQueue';
import type { RecordRepository } from '../../src/data/recordRepository';
import { createSettingsStore } from '../../src/data/settingsStore';
import { AppProvider, useApp, type AppServices } from '../../src/state/AppProvider';

export type Harness = {
  services: AppServices;
  auth: jest.Mocked<AuthRepository>;
  records: jest.Mocked<RecordRepository>;
  send: jest.Mock<Promise<void>, [string, NewRecord]>;
  net: { online: boolean };
};

export function makeHarness(options: { userId?: string | null; online?: boolean } = {}): Harness {
  const userId = options.userId === undefined ? 'user-1' : options.userId;
  const net = { online: options.online ?? true };
  const auth: jest.Mocked<AuthRepository> = {
    signUp: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(async () => ({ ok: true as const })),
    getCurrentUserId: jest.fn(async () => userId),
    onUserChange: jest.fn((_listener: (id: string | null) => void) => () => undefined),
  };
  const records: jest.Mocked<RecordRepository> = {
    save: jest.fn(async (_userId: string, _record: NewRecord) => undefined),
    list: jest.fn(async (_userId: string): Promise<PlayRecord[]> => []),
    updateMemo: jest.fn(),
  };
  const send = jest.fn(async (_userId: string, _record: NewRecord) => {
    if (!net.online) throw new TypeError('Network request failed');
  });
  const network: NetworkStatus = {
    isOnline: async () => net.online,
    subscribe: () => () => undefined,
  };
  const services: AppServices = {
    auth,
    records,
    pending: new PendingQueue({ storage: AsyncStorage, send, isOnline: network.isOnline }),
    settingsStore: createSettingsStore(),
    network,
  };
  return { services, auth, records, send, net };
}

/** 端末内の設定とアカウントを読み終えてから、画面を出す（アプリの _layout と同じ）。 */
function ReadyGate({ children }: { children: React.ReactNode }) {
  const { ready } = useApp();
  return ready ? <>{children}</> : null;
}

const METRICS = { frame: { x: 0, y: 0, width: 1024, height: 768 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

export async function renderWithApp(ui: React.ReactElement, harness: Harness) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppProvider services={harness.services}>
        <ReadyGate>{ui}</ReadyGate>
      </AppProvider>
    </SafeAreaProvider>,
  );
}

/** 1本の指で軌跡をなぞる（指ごとに identifier を変える）。 */
export async function drawStroke(element: Parameters<typeof fireEvent>[0], points: Point[], identifier = 1) {
  const touch = (p: Point) => ({ nativeEvent: { changedTouches: [{ identifier, pageX: p.x, pageY: p.y }] } });
  await fireEvent(element, 'touchStart', touch(points[0]));
  for (const p of points.slice(1, -1)) await fireEvent(element, 'touchMove', touch(p));
  await fireEvent(element, 'touchEnd', touch(points[points.length - 1]));
}
