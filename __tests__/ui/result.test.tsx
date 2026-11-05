import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen } from '@testing-library/react-native';
import React from 'react';

import ResultScreen from '../../app/result';
import { PENDING_STORAGE_KEY } from '../../src/data/pendingQueue';
import { clearLatestResult, setLatestResult } from '../../src/state/resultStore';
import { drawStroke, makeHarness, renderWithApp } from '../helpers/appHarness';
import { mockRouter, resetRouter } from '../helpers/routerMock';
import { alphaStroke, lineStroke, tapStroke } from '../fixtures/strokes';

jest.mock('expo-router', () => require('../helpers/routerMock'));

const record = { clientId: 'session-1', playedAt: '2026-11-03T11:15:00.000Z', durationMs: 750_000 };

beforeEach(async () => {
  await AsyncStorage.clear();
  resetRouter();
  clearLatestResult();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('S5 遊びの結果', () => {
  it('shows the played time and "記録しました" once saved (FR5.2, FR5.3)', async () => {
    setLatestResult({ recorded: true, record });
    const h = makeHarness();
    await renderWithApp(<ResultScreen />, h);

    expect(screen.getByRole('header', { name: '遊びが終わりました' })).toBeOnTheScreen();
    expect(screen.getByTestId('result-time')).toHaveTextContent('12分30秒');
    expect(await screen.findByText('記録しました')).toBeOnTheScreen();
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send).toHaveBeenCalledWith('user-1', record);
  });

  it('keeps the record on the device and shows "保存待ち" when offline (FR7.1)', async () => {
    setLatestResult({ recorded: true, record });
    const h = makeHarness({ online: false });
    await renderWithApp(<ResultScreen />, h);

    expect(await screen.findByText('保存待ち（通信が戻ったら自動で送ります）')).toBeOnTheScreen();
    expect(JSON.parse((await AsyncStorage.getItem(PENDING_STORAGE_KEY))!)).toEqual([
      expect.objectContaining({ clientId: 'session-1', userId: 'user-1' }),
    ]);
  });

  it('says "今回は遊びませんでした" and saves nothing for an untouched session (FR4.4)', async () => {
    setLatestResult({ recorded: false });
    const h = makeHarness();
    await renderWithApp(<ResultScreen />, h);

    expect(screen.getByText('今回は遊びませんでした')).toBeOnTheScreen();
    expect(screen.queryByTestId('result-time')).toBeNull();
    expect(h.send).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(PENDING_STORAGE_KEY)).toBeNull();
  });

  it('has no buttons; taps and strokes do nothing, only α returns home (FR3.3, NFR1)', async () => {
    setLatestResult({ recorded: false });
    await renderWithApp(<ResultScreen />, makeHarness());
    const surface = screen.getByTestId('result-screen');
    expect(screen.queryAllByRole('button')).toHaveLength(0);

    await drawStroke(surface, tapStroke(), 1);
    await drawStroke(surface, lineStroke(), 2);
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await drawStroke(surface, alphaStroke(), 3);
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });
});
