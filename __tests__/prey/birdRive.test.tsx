import { act, render, screen } from '@testing-library/react-native';
import React from 'react';
import type { SharedValue } from 'react-native-reanimated';

import { birdKind } from '../../src/prey/kinds/bird';
import { BIRD_RIVE_START_TIMEOUT_MS, createBirdRiveOverlay } from '../../src/prey/render/BirdRive';
import { BIRD_RIVE_SOURCE } from '../../src/prey/render/birdRiveAsset';
import type { World } from '../../src/prey/types';
import { createWorld } from '../../src/prey/world';
import { evenly } from '../helpers/preyCounts';

type RiveProps = { onPlay?: () => void; onError?: (e: { type: string; message: string }) => void; source?: unknown };

// Rive の表示は、渡された props を覚えておくだけの部品にする（読み込めた・読み込めなかったをテストから起こす）
const mockRiveProps: RiveProps[] = [];
jest.mock('rive-react-native', () => ({
  __esModule: true,
  default: (props: RiveProps) => {
    mockRiveProps.push(props);
    return null;
  },
  Fit: { Contain: 'contain' },
  Alignment: { Center: 'center' },
}));

const field = { width: 1024, height: 768 };
const FAKE_RIV = 42;

/** 小鳥が 2 羽いる世界（10 匹 → 5 種類 × 2 匹） */
function worldWithBirds(): SharedValue<World | null> {
  const world = createWorld({ counts: evenly(10), field, isTablet: true, now: 0, rand: () => 0.5 });
  return { value: world } as unknown as SharedValue<World | null>;
}

const lastRive = () => mockRiveProps[mockRiveProps.length - 1];

let warn: jest.SpyInstance;
beforeEach(() => {
  mockRiveProps.length = 0;
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warn.mockRestore();
  jest.useRealTimers();
});

describe('Rive の小鳥 (FR2.9)', () => {
  it('has no bird.riv yet, and the bird kind keeps its Skia drawing with the Rive overlay on top', () => {
    expect(BIRD_RIVE_SOURCE).toBeNull();
    expect(typeof birdKind.render).toBe('function');
    expect(birdKind.Overlay).toBeDefined();
  });

  it('draws nothing and leaves the bird to Skia when the switch is off', async () => {
    const Overlay = createBirdRiveOverlay({ enabled: false, source: FAKE_RIV });
    const onDrawingChange = jest.fn();
    await render(<Overlay world={worldWithBirds()} kind="bird" onDrawingChange={onDrawingChange} />);
    expect(screen.queryByTestId('bird-rive-layer')).toBeNull();
    expect(mockRiveProps).toHaveLength(0);
    expect(onDrawingChange).not.toHaveBeenCalled();
  });

  it('falls back to Skia, with a warning, when the switch is on but bird.riv is missing', async () => {
    const Overlay = createBirdRiveOverlay({ enabled: true, source: null });
    const onDrawingChange = jest.fn();
    await render(<Overlay world={worldWithBirds()} kind="bird" onDrawingChange={onDrawingChange} />);
    expect(screen.queryByTestId('bird-rive-layer')).toBeNull();
    expect(mockRiveProps).toHaveLength(0);
    expect(onDrawingChange).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('bird.riv is not set'));
  });

  it('takes the birds over from Skia once Rive starts playing (happy path)', async () => {
    const Overlay = createBirdRiveOverlay({ enabled: true, source: FAKE_RIV });
    const onDrawingChange = jest.fn();
    await render(<Overlay world={worldWithBirds()} kind="bird" onDrawingChange={onDrawingChange} />);
    // 小鳥 1 羽に 1 つずつ Rive の表示を置き、再生が始まるまでは見せない
    expect(new Set(mockRiveProps.map((p) => p.source))).toEqual(new Set([FAKE_RIV]));
    expect(screen.getByTestId('bird-rive-layer')).toHaveStyle({ opacity: 0 });
    expect(onDrawingChange).not.toHaveBeenCalled();

    await act(async () => lastRive().onPlay?.());
    expect(onDrawingChange).toHaveBeenCalledTimes(1);
    expect(onDrawingChange).toHaveBeenCalledWith(true);
    expect(screen.getByTestId('bird-rive-layer')).toHaveStyle({ opacity: 1 });
  });

  it('falls back to Skia when bird.riv cannot be loaded', async () => {
    const Overlay = createBirdRiveOverlay({ enabled: true, source: FAKE_RIV });
    const onDrawingChange = jest.fn();
    await render(<Overlay world={worldWithBirds()} kind="bird" onDrawingChange={onDrawingChange} />);
    await act(async () => lastRive().onError?.({ type: 'MalformedFile', message: 'bad file' }));
    expect(screen.queryByTestId('bird-rive-layer')).toBeNull();
    expect(onDrawingChange).not.toHaveBeenCalledWith(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('MalformedFile'), 'bad file');
  });

  it('gives the birds back to Skia when Rive fails after it had started', async () => {
    const Overlay = createBirdRiveOverlay({ enabled: true, source: FAKE_RIV });
    const onDrawingChange = jest.fn();
    await render(<Overlay world={worldWithBirds()} kind="bird" onDrawingChange={onDrawingChange} />);
    await act(async () => lastRive().onPlay?.());
    await act(async () => lastRive().onError?.({ type: 'DataBindingError', message: 'broken' }));
    expect(onDrawingChange.mock.calls).toEqual([[true], [false]]);
    expect(screen.queryByTestId('bird-rive-layer')).toBeNull();
  });

  it('does not load rive-react-native at all while the switch is off or bird.riv is missing (R-02)', async () => {
    const loadRive = jest.fn(() => jest.requireMock('rive-react-native'));
    const Off = createBirdRiveOverlay({ enabled: false, source: FAKE_RIV, loadRive });
    const Missing = createBirdRiveOverlay({ enabled: true, source: null, loadRive });
    await render(<Off world={worldWithBirds()} kind="bird" onDrawingChange={jest.fn()} />);
    await render(<Missing world={worldWithBirds()} kind="bird" onDrawingChange={jest.fn()} />);
    expect(loadRive).not.toHaveBeenCalled();
  });

  it('loads rive-react-native only once, when the switch is on and bird.riv is set (R-02)', async () => {
    const loadRive = jest.fn(() => jest.requireMock('rive-react-native'));
    const Overlay = createBirdRiveOverlay({ enabled: true, source: FAKE_RIV, loadRive });
    const view = await render(<Overlay world={worldWithBirds()} kind="bird" onDrawingChange={jest.fn()} />);
    await view.rerender(<Overlay world={worldWithBirds()} kind="bird" onDrawingChange={jest.fn()} />);
    expect(loadRive).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('bird-rive-layer')).toBeTruthy();
  });

  it('falls back to Skia, with a warning, when rive-react-native cannot be loaded (R-02)', async () => {
    const failure = new Error('native module RiveReactNativeView not found');
    const loadRive = jest.fn(() => {
      throw failure;
    });
    const Overlay = createBirdRiveOverlay({ enabled: true, source: FAKE_RIV, loadRive });
    const onDrawingChange = jest.fn();
    const view = await render(<Overlay world={worldWithBirds()} kind="bird" onDrawingChange={onDrawingChange} />);
    await view.rerender(<Overlay world={worldWithBirds()} kind="bird" onDrawingChange={onDrawingChange} />);
    expect(screen.queryByTestId('bird-rive-layer')).toBeNull();
    expect(mockRiveProps).toHaveLength(0);
    expect(onDrawingChange).not.toHaveBeenCalled();
    // 一度失敗したら、もう読み込みを試さない
    expect(loadRive).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not load rive-react-native'), failure);
  });

  it('falls back to Skia when Rive does not start playing in time', async () => {
    jest.useFakeTimers();
    const Overlay = createBirdRiveOverlay({ enabled: true, source: FAKE_RIV });
    const onDrawingChange = jest.fn();
    await render(<Overlay world={worldWithBirds()} kind="bird" onDrawingChange={onDrawingChange} />);
    expect(screen.getByTestId('bird-rive-layer')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(BIRD_RIVE_START_TIMEOUT_MS + 10);
    });
    expect(screen.queryByTestId('bird-rive-layer')).toBeNull();
    expect(onDrawingChange).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('did not start playing'), '');
  });
});
