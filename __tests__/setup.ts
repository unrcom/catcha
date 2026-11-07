/* Jest setup: native modules that have no JS implementation in tests are replaced here. */
/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);

jest.mock('expo-audio', () => {
  const makePlayer = () => ({
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(() => Promise.resolve()),
    remove: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    currentTime: 0,
    volume: 1,
  });
  return {
    useAudioPlayer: jest.fn(() => makePlayer()),
    createAudioPlayer: jest.fn(() => makePlayer()),
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
  };
});

// UI スレッドで動かす部品（reanimated・worklets）は、それぞれの公式のテスト用の置き換えを使う
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// Skia はネイティブの描画なので、テストでは何も描かない部品に置き換える（描画の見た目は単体テストでは確かめない）
jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const { View } = require('react-native');
  const noop = () => undefined;
  const makePaint = () => ({
    setColor: noop,
    setAlphaf: noop,
    setAntiAlias: noop,
    setStyle: noop,
    setStrokeWidth: noop,
    setStrokeCap: noop,
    setStrokeJoin: noop,
  });
  const makePathBuilder = () => {
    const builder = { moveTo: () => builder, lineTo: () => builder, quadTo: () => builder, detach: () => ({}) };
    return builder;
  };
  return {
    Canvas: ({ children, style }: { children?: unknown; style?: unknown }) =>
      React.createElement(View, { style, testID: 'skia-canvas' }, children),
    Picture: () => null,
    Skia: {
      Paint: makePaint,
      PathBuilder: { Make: makePathBuilder },
      Color: (c: string) => c,
      XYWHRect: (x: number, y: number, width: number, height: number) => ({ x, y, width, height }),
    },
    // 描く関数は何も描かない canvas で呼ぶ（描き方の関数が最後まで動くかだけを確かめられるように）
    createPicture: (draw: (canvas: unknown) => void) => {
      const canvas = new Proxy({}, { get: () => noop });
      draw(canvas);
      return { __picture: true };
    },
    PaintStyle: { Fill: 0, Stroke: 1 },
    StrokeCap: { Butt: 0, Round: 1, Square: 2 },
    StrokeJoin: { Miter: 0, Round: 1, Bevel: 2 },
  };
});

// Rive の表示も、テストでは何も描かない部品に置き換える
jest.mock('rive-react-native', () => ({
  __esModule: true,
  default: () => null,
  Fit: { Contain: 'contain' },
  Alignment: { Center: 'center' },
}));

jest.mock('expo-keep-awake', () => ({
  useKeepAwake: jest.fn(),
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-navigation-bar', () => ({
  setVisibilityAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-screen-orientation', () => ({
  Orientation: { UNKNOWN: 0, PORTRAIT_UP: 1, PORTRAIT_DOWN: 2, LANDSCAPE_LEFT: 3, LANDSCAPE_RIGHT: 4 },
  OrientationLock: {
    DEFAULT: 0,
    ALL: 1,
    PORTRAIT: 2,
    PORTRAIT_UP: 3,
    PORTRAIT_DOWN: 4,
    LANDSCAPE: 5,
    LANDSCAPE_LEFT: 6,
    LANDSCAPE_RIGHT: 7,
  },
  getOrientationAsync: jest.fn(() => Promise.resolve(3)),
  lockAsync: jest.fn(() => Promise.resolve()),
  unlockAsync: jest.fn(() => Promise.resolve()),
}));
