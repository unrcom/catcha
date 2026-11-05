import { renderHook } from '@testing-library/react-native';
import { useAudioPlayer } from 'expo-audio';

import { useToySounds } from '../../src/ui/useToySounds';

const players = () => (useAudioPlayer as jest.Mock).mock.results.map((r) => r.value as { play: jest.Mock });

describe('useToySounds (FR2.6)', () => {
  beforeEach(() => (useAudioPlayer as jest.Mock).mockClear());

  it('plays each object rustle on its own player, so two objects do not cut each other off', async () => {
    const { result } = await renderHook(() => useToySounds(true));
    result.current.playMove('string');
    result.current.playMove('tail');
    const played = players().filter((p) => p.play.mock.calls.length > 0);
    expect(played).toHaveLength(2);
  });

  it('does not repeat the same object rustle within a second', async () => {
    const { result } = await renderHook(() => useToySounds(true));
    result.current.playMove('teaser');
    result.current.playMove('teaser');
    const calls = players().reduce((n, p) => n + p.play.mock.calls.length, 0);
    expect(calls).toBe(1);
  });

  it('alternates the two mouse footsteps so they sound like teke-teke', async () => {
    const { result } = await renderHook(() => useToySounds(true));
    const now = jest.spyOn(Date, 'now');
    let t = 10_000;
    now.mockImplementation(() => t);
    for (let i = 0; i < 4; i += 1) {
      result.current.playStep();
      t += 200;
    }
    now.mockRestore();
    const played = players().filter((p) => p.play.mock.calls.length > 0);
    expect(played).toHaveLength(2);
    played.forEach((p) => expect(p.play).toHaveBeenCalledTimes(2));
  });

  it('stays silent when sound is off', async () => {
    const { result } = await renderHook(() => useToySounds(false));
    result.current.playMove('tail');
    result.current.playStartle();
    expect(players().every((p) => p.play.mock.calls.length === 0)).toBe(true);
  });
});
