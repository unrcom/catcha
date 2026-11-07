import { renderHook } from '@testing-library/react-native';
import { createAudioPlayer } from 'expo-audio';

import { useToySounds } from '../../src/ui/useToySounds';

// 再生器は獲物の種類の定義の音から作る（v0.1）。確かめている振る舞いは v0.0.0 と同じ
const players = () => (createAudioPlayer as jest.Mock).mock.results.map((r) => r.value as { play: jest.Mock; remove: jest.Mock });

describe('useToySounds (FR2.6, FR4.4)', () => {
  beforeEach(() => (createAudioPlayer as jest.Mock).mockClear());
  afterEach(() => jest.restoreAllMocks());

  it('plays each object rustle on its own player, so two objects do not cut each other off', async () => {
    const { result } = await renderHook(() => useToySounds(true));
    result.current.play('string', 'move');
    result.current.play('tail', 'move');
    const played = players().filter((p) => p.play.mock.calls.length > 0);
    expect(played).toHaveLength(2);
  });

  it('does not repeat the same object rustle within a second', async () => {
    const { result } = await renderHook(() => useToySounds(true));
    result.current.play('teaser', 'move');
    result.current.play('teaser', 'move');
    const calls = players().reduce((n, p) => n + p.play.mock.calls.length, 0);
    expect(calls).toBe(1);
  });

  it('alternates the two mouse footsteps so they sound like teke-teke', async () => {
    const { result } = await renderHook(() => useToySounds(true));
    const now = jest.spyOn(Date, 'now');
    let t = 10_000;
    now.mockImplementation(() => t);
    for (let i = 0; i < 4; i += 1) {
      result.current.play('mouse', 'step');
      t += 200;
    }
    now.mockRestore();
    const played = players().filter((p) => p.play.mock.calls.length > 0);
    expect(played).toHaveLength(2);
    played.forEach((p) => expect(p.play).toHaveBeenCalledTimes(2));
  });

  it('stays silent when sound is off', async () => {
    const { result } = await renderHook(() => useToySounds(false));
    result.current.play('tail', 'move');
    result.current.playStartle();
    expect(players().every((p) => p.play.mock.calls.length === 0)).toBe(true);
  });

  it('plays the catch sound', async () => {
    const { result } = await renderHook(() => useToySounds(true));
    result.current.playStartle();
    expect(players().filter((p) => p.play.mock.calls.length > 0)).toHaveLength(1);
  });

  it('warns once and plays nothing for a sound that no kind defines', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result } = await renderHook(() => useToySounds(true));
    result.current.play('mouse', 'no-such-sound');
    result.current.play('mouse', 'no-such-sound');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(players().every((p) => p.play.mock.calls.length === 0)).toBe(true);
  });

  it('keeps playing the other sounds when one player cannot be created', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (createAudioPlayer as jest.Mock).mockImplementationOnce(() => {
      throw new Error('no audio device');
    });
    const { result } = await renderHook(() => useToySounds(true));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not create player'), expect.any(Error));
    result.current.play('tail', 'move');
    expect(players().filter((p) => p?.play?.mock.calls.length > 0)).toHaveLength(1);
  });

  it('releases the players when the play screen goes away', async () => {
    const { unmount } = await renderHook(() => useToySounds(true));
    const created = players();
    expect(created.length).toBeGreaterThan(0);
    await unmount();
    created.forEach((p) => expect(p.remove).toHaveBeenCalled());
  });
});
