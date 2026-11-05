import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import HomeScreen from '../../app/index';
import { MAX_RETRY_FAILURES, PENDING_STORAGE_KEY, type PendingEntry } from '../../src/data/pendingQueue';
import { createSettingsStore } from '../../src/data/settingsStore';
import { makeHarness, renderWithApp } from '../helpers/appHarness';
import { mockRouter, resetRouter } from '../helpers/routerMock';

jest.mock('expo-router', () => require('../helpers/routerMock'));

function pendingEntry(clientId: string, failures: number): PendingEntry {
  return { clientId, userId: 'user-1', playedAt: '2026-11-03T11:15:00.000Z', durationMs: 300_000, failures };
}

async function storePending(entries: PendingEntry[]) {
  await AsyncStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(entries));
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resetRouter();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('S2 ホーム', () => {
  it('shows the heading and the main actions (NFR6)', async () => {
    await renderWithApp(<HomeScreen />, makeHarness());
    expect(screen.getByRole('header', { name: 'ホーム' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('home-play-button'));
    expect(mockRouter.push).toHaveBeenCalledWith('/guide');
    expect(screen.queryByTestId('home-unsent-banner')).toBeNull();
  });

  it('saves seconds, sound and background as soon as they change (FR4.2, FR2.6)', async () => {
    await renderWithApp(<HomeScreen />, makeHarness());
    expect(screen.getByTestId('settings-idle-30')).toHaveProp('accessibilityState', { checked: true });

    await fireEvent.press(screen.getByTestId('settings-idle-120'));
    await fireEvent(screen.getByTestId('settings-sound-switch'), 'valueChange', false);
    await fireEvent.press(screen.getByTestId('settings-background-light'));

    await waitFor(async () =>
      expect(await createSettingsStore().load()).toEqual({ idleSeconds: 120, soundOn: false, background: 'light' }),
    );
    expect(screen.getByTestId('settings-idle-120')).toHaveProp('accessibilityState', { checked: true });
    expect(screen.getByText('オフ')).toBeOnTheScreen();
  });

  it('shows the unsent-records banner and clears it after a successful retry (FR7.3, FR7.4)', async () => {
    await storePending([pendingEntry('c1', MAX_RETRY_FAILURES)]);
    const h = makeHarness();
    // ホームを開いたときの自動の送り直しは失敗させ、「再試行」で送れるようにする
    h.send.mockRejectedValueOnce(new Error('server error'));
    await renderWithApp(<HomeScreen />, h);

    expect(await screen.findByText('保存できていない記録があります')).toBeOnTheScreen();
    await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByTestId('home-retry-button'));

    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.send).toHaveBeenLastCalledWith('user-1', expect.objectContaining({ clientId: 'c1' }));
    expect(await screen.findByText('記録しました')).toBeOnTheScreen();
    expect(screen.queryByText('保存できていない記録があります')).toBeNull();
  });

  it('keeps the banner and explains a failed retry in words', async () => {
    await storePending([pendingEntry('c1', MAX_RETRY_FAILURES)]);
    const h = makeHarness({ online: false });
    await renderWithApp(<HomeScreen />, h);

    await fireEvent.press(await screen.findByTestId('home-retry-button'));
    expect(await screen.findByText('送れませんでした。通信状態を確認してください')).toBeOnTheScreen();
    expect(screen.getByText('保存できていない記録があります')).toBeOnTheScreen();
  });

  it('logs out without asking when nothing is waiting to be sent (FR1.3)', async () => {
    const h = makeHarness();
    await renderWithApp(<HomeScreen />, h);
    await fireEvent.press(screen.getByTestId('home-logout-button'));
    expect(screen.queryByText('ログアウトしますか？')).toBeNull();
    expect(h.auth.signOut).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/login');
  });

  it('asks before deleting unsent records; cancel keeps them, confirm deletes them (FR1.3)', async () => {
    await storePending([pendingEntry('c1', 0), pendingEntry('c2', 1)]);
    const h = makeHarness({ online: false });
    await renderWithApp(<HomeScreen />, h);

    await fireEvent.press(screen.getByTestId('home-logout-button'));
    expect(await screen.findByText('ログアウトしますか？')).toBeOnTheScreen();
    expect(screen.getByText(/送れていない記録が 2 件あります/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('logout-confirm-cancel'));
    expect(h.auth.signOut).not.toHaveBeenCalled();
    expect(await h.services.pending.count('user-1')).toBe(2);

    await fireEvent.press(screen.getByTestId('home-logout-button'));
    await fireEvent.press(await screen.findByTestId('logout-confirm-confirm'));
    expect(h.auth.signOut).toHaveBeenCalled();
    expect(await AsyncStorage.getItem(PENDING_STORAGE_KEY)).toBeNull();
    expect(mockRouter.replace).toHaveBeenCalledWith('/login');
  });
});
