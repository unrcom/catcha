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

  it('shows the app version in a corner, so a person can tell which build is installed', async () => {
    await renderWithApp(<HomeScreen />, makeHarness());
    expect(screen.getByTestId('home-version')).toHaveTextContent(/^v/);
  });

  it('saves seconds, sound and background as soon as they change (FR4.2, FR2.6)', async () => {
    await renderWithApp(<HomeScreen />, makeHarness());
    expect(screen.getByTestId('settings-idle-30')).toHaveProp('accessibilityState', { checked: true });

    await fireEvent.press(screen.getByTestId('settings-idle-120'));
    await fireEvent(screen.getByTestId('settings-sound-switch'), 'valueChange', false);
    await fireEvent.press(screen.getByTestId('settings-background-light'));

    await waitFor(async () =>
      expect(await createSettingsStore().load()).toEqual({ idleSeconds: 120, soundOn: false, background: 'light', preyCounts: { string: 1, tail: 1, teaser: 1, mouse: 1, bird: 1 } }),
    );
    expect(screen.getByTestId('settings-idle-120')).toHaveProp('accessibilityState', { checked: true });
    expect(screen.getByText('オフ')).toBeOnTheScreen();
  });

  it('lets the owner choose the number of each kind from 0, with a total of 1 to 50, and saves it (FR5.1, FR5.3)', async () => {
    await renderWithApp(<HomeScreen />, makeHarness());
    expect(screen.getByTestId('settings-prey-total')).toHaveTextContent('獲物の数（合計 5匹、50匹まで）');
    for (const label of ['紐', 'しっぽ', '猫じゃらし', 'ネズミ', '小鳥']) expect(screen.getByText(label)).toBeOnTheScreen();
    expect(screen.getByTestId('settings-prey-bird-count')).toHaveTextContent('1匹');

    await fireEvent.press(screen.getByTestId('settings-prey-bird-minus'));
    expect(screen.getByTestId('settings-prey-bird-count')).toHaveTextContent('0匹');
    // 0 匹からは減らせない
    expect(screen.getByTestId('settings-prey-bird-minus')).toHaveProp('accessibilityState', { disabled: true });
    expect(screen.getByTestId('settings-prey-bird-minus')).toHaveProp('accessibilityHint', '小鳥は0匹です');
    await fireEvent.press(screen.getByTestId('settings-prey-mouse-plus'));

    await waitFor(async () =>
      expect((await createSettingsStore().load()).preyCounts).toEqual({ string: 1, tail: 1, teaser: 1, mouse: 2, bird: 0 }),
    );
    expect(screen.getByTestId('settings-prey-total')).toHaveTextContent('獲物の数（合計 5匹、50匹まで）');
  });

  it('chooses a test set at once, and cannot go above 50 in total (FR5.1, FR5.2)', async () => {
    await renderWithApp(<HomeScreen />, makeHarness());
    expect(screen.getByTestId('settings-prey-preset-v0')).toHaveProp('accessibilityState', { checked: false });

    await fireEvent.press(screen.getByTestId('settings-prey-preset-v0'));
    expect(screen.getByTestId('settings-prey-preset-v0')).toHaveProp('accessibilityState', { checked: true });
    expect(screen.getByTestId('settings-prey-bird-count')).toHaveTextContent('0匹');
    expect(screen.getByTestId('settings-prey-total')).toHaveTextContent(/合計 4匹/);

    await fireEvent.press(screen.getByTestId('settings-prey-preset-each10'));
    await waitFor(async () =>
      expect((await createSettingsStore().load()).preyCounts).toEqual({ string: 10, tail: 10, teaser: 10, mouse: 10, bird: 10 }),
    );
    expect(screen.getByTestId('settings-prey-total')).toHaveTextContent(/合計 50匹/);
    for (const kind of ['string', 'tail', 'teaser', 'mouse', 'bird']) {
      expect(screen.getByTestId(`settings-prey-${kind}-plus`)).toHaveProp('accessibilityState', { disabled: true });
      expect(screen.getByTestId(`settings-prey-${kind}-plus`)).toHaveProp('accessibilityHint', '合計は50匹までです');
    }
    expect(screen.getByTestId('settings-prey-preset-v0')).toHaveProp('accessibilityState', { checked: false });
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
