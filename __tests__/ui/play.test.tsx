import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import React from 'react';

import PlayScreen from '../../app/play';
import { SETTINGS_STORAGE_KEY } from '../../src/data/settingsStore';
import * as preyWorld from '../../src/prey/world';
import { clearLatestResult, getLatestResult } from '../../src/state/resultStore';
import { drawStroke, makeHarness, renderWithApp } from '../helpers/appHarness';
import { mockRouter, resetRouter } from '../helpers/routerMock';
import { alphaStroke, lineStroke } from '../fixtures/strokes';

jest.mock('expo-router', () => require('../helpers/routerMock'));

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resetRouter();
  clearLatestResult();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('S3 遊び画面', () => {
  it('has no pressable element and no visible text, only a screen-reader heading (FR2.5)', async () => {
    await renderWithApp(<PlayScreen />, makeHarness());
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByRole('header', { name: '遊び中' })).toHaveStyle({ opacity: 0 });
    // 見出し以外の文字はない
    expect(screen.queryAllByText(/.+/).map((el) => el.props.testID)).toEqual(['play-sr-heading']);
  });

  it('puts out as many prey of each kind as the settings say (FR5.1, FR5.2)', async () => {
    const preyCounts = { string: 1, tail: 1, teaser: 1, mouse: 2, bird: 0 };
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ idleSeconds: 30, soundOn: true, background: 'dark', preyCounts }));
    const createWorld = jest.spyOn(preyWorld, 'createWorld');
    await renderWithApp(<PlayScreen />, makeHarness());
    expect(createWorld).toHaveBeenLastCalledWith(expect.objectContaining({ counts: preyCounts, isTablet: true }));
    const agents = createWorld.mock.results[createWorld.mock.results.length - 1].value.agents as { kind: string }[];
    expect(agents.map((a) => a.kind)).toEqual(['string', 'tail', 'teaser', 'mouse', 'mouse']);
  });

  it('keeps the screen awake and locks the current orientation (NFR2)', async () => {
    await renderWithApp(<PlayScreen />, makeHarness());
    expect(useKeepAwake).toHaveBeenCalled();
    expect(ScreenOrientation.lockAsync).toHaveBeenCalled();
  });

  it('does nothing for a stroke that is not α (FR3.4)', async () => {
    await renderWithApp(<PlayScreen />, makeHarness());
    await drawStroke(screen.getByTestId('play-field'), lineStroke());
    expect(screen.queryByTestId('owner-menu')).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('opens the owner menu with α and closes it after 10 seconds (FR3.1, FR3.2)', async () => {
    jest.useFakeTimers();
    await renderWithApp(<PlayScreen />, makeHarness());

    await drawStroke(screen.getByTestId('play-field'), alphaStroke());
    expect(screen.getByRole('header', { name: '飼い主メニュー' })).toBeOnTheScreen();
    expect(screen.getByTestId('owner-menu-countdown')).toHaveTextContent('10秒で遊びに戻ります');

    await advance(5_000);
    expect(screen.getByTestId('owner-menu-countdown')).toHaveTextContent('5秒で遊びに戻ります');

    await advance(5_250);
    expect(screen.queryByTestId('owner-menu')).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('ends an untouched session after 30 seconds and does not record it (FR4.4)', async () => {
    jest.useFakeTimers();
    await renderWithApp(<PlayScreen />, makeHarness());

    await advance(29_000);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    await advance(1_250);
    expect(mockRouter.replace).toHaveBeenCalledWith('/result');
    expect(getLatestResult()).toEqual({ recorded: false });
  });

  it('records the time from the first to the last cat touch when the owner ends the play (FR5.1, FR3.2)', async () => {
    jest.useFakeTimers();
    await renderWithApp(<PlayScreen />, makeHarness());
    const field = screen.getByTestId('play-field');

    await advance(10_000);
    await drawStroke(field, lineStroke(), 1); // 最初のタッチ
    await advance(20_000);
    await drawStroke(field, lineStroke(), 2); // 最後のタッチ（20秒後）
    await advance(5_000);
    await drawStroke(field, alphaStroke(), 3); // 飼い主の「α」は数えない
    await fireEvent.press(screen.getByTestId('owner-menu-end-button'));

    expect(mockRouter.replace).toHaveBeenCalledWith('/result');
    const result = getLatestResult();
    expect(result).toMatchObject({ recorded: true, record: { durationMs: 20_000 } });
  });
});
