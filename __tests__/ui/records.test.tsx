import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';

import RecordsScreen from '../../app/records';
import type { PlayRecord } from '../../src/domain/records';
import { RecordError } from '../../src/data/recordRepository';
import { makeHarness, renderWithApp } from '../helpers/appHarness';
import { mockRouter, resetRouter } from '../helpers/routerMock';

jest.mock('expo-router', () => require('../helpers/routerMock'));

function rec(id: string, day: number, durationMs: number, memo: string | null = null): PlayRecord {
  return { id, playedAt: new Date(2026, 10, day, 20, 15).toISOString(), durationMs, memo, clientId: `c-${id}` };
}

const three = [rec('r3', 3, 750_000, 'ミケとトラ'), rec('r2', 2, 365_000), rec('r1', 1, 445_000)];

beforeEach(async () => {
  await AsyncStorage.clear();
  resetRouter();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('S6 記録', () => {
  it('lists records newest first with the recent-3 average (FR6.1)', async () => {
    const h = makeHarness();
    h.records.list.mockResolvedValue([three[2], three[0], three[1]]); // 順不同で返っても新しい順に並べる
    await renderWithApp(<RecordsScreen />, h);

    expect(screen.getByRole('header', { name: '記録' })).toBeOnTheScreen();
    expect(await screen.findByText('8分40秒')).toBeOnTheScreen();
    const items = screen.getAllByTestId(/^records-item-/).map((el) => el.props.testID);
    expect(items).toEqual(['records-item-r3', 'records-item-r2', 'records-item-r1']);
    expect(screen.getByText('メモ：ミケとトラ')).toBeOnTheScreen();
    expect(h.records.list).toHaveBeenCalledWith('user-1');
  });

  it('asks for three plays before showing an average', async () => {
    const h = makeHarness();
    h.records.list.mockResolvedValue([three[0]]);
    await renderWithApp(<RecordsScreen />, h);
    expect(await screen.findByText('3回遊ぶと平均が表示されます')).toBeOnTheScreen();
  });

  it('shows the empty state with a play button (FR6.3)', async () => {
    await renderWithApp(<RecordsScreen />, makeHarness());
    expect(await screen.findByText(/まだ記録がありません/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('records-play-button'));
    expect(mockRouter.push).toHaveBeenCalledWith('/guide');
  });

  it('shows a load error with a retry button that loads again (FR6.3)', async () => {
    const h = makeHarness();
    h.records.list.mockRejectedValueOnce(new RecordError('network', 'list')).mockResolvedValueOnce(three);
    await renderWithApp(<RecordsScreen />, h);

    expect(await screen.findByText('記録を読み込めませんでした')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('records-retry-button'));
    expect(await screen.findByText('8分40秒')).toBeOnTheScreen();
  });

  it('saves a memo and shows it in the list (FR6.2)', async () => {
    const h = makeHarness();
    h.records.list.mockResolvedValue(three);
    h.records.updateMemo.mockImplementation(async (_u, id, memo) => ({ ...three.find((r) => r.id === id)!, memo }));
    await renderWithApp(<RecordsScreen />, h);

    await fireEvent.press(await screen.findByTestId('records-edit-r2'));
    await fireEvent.changeText(screen.getByTestId('memo-input'), 'シロ');
    await fireEvent.press(screen.getByTestId('memo-save-button'));

    expect(h.records.updateMemo).toHaveBeenCalledWith('user-1', 'r2', 'シロ');
    expect(await screen.findByText('メモ：シロ')).toBeOnTheScreen();
    expect(screen.queryByTestId('memo-input')).toBeNull();
  });

  it('explains a failed memo save in words and keeps the editor open', async () => {
    const h = makeHarness();
    h.records.list.mockResolvedValue(three);
    h.records.updateMemo.mockRejectedValue(new RecordError('network', 'updateMemo'));
    await renderWithApp(<RecordsScreen />, h);

    await fireEvent.press(await screen.findByTestId('records-edit-r1'));
    await fireEvent.changeText(screen.getByTestId('memo-input'), 'クロ');
    await fireEvent.press(screen.getByTestId('memo-save-button'));

    expect(await screen.findByText('保存できませんでした。もう一度お試しください')).toBeOnTheScreen();
    expect(screen.getByTestId('memo-input')).toBeOnTheScreen();
  });
});
