/** 色・文字・間隔（design-system-mapping.md）。 */
import type { Background } from '../data/settingsStore';

export const colors = {
  primary: '#1F5FBF',
  onPrimary: '#FFFFFF',
  text: '#1A1A1A',
  textMuted: '#4A4F57',
  surface: '#FFFFFF',
  surfaceAlt: '#F2F4F7',
  border: '#5F6670',
  error: '#B3261E',
  errorSurface: '#FCEEEE',
  success: '#1B6E3A',
  playBgDark: '#14161A',
  playBgLight: '#D9DCE0',
  toyBlue: '#3D7BFF',
  toyYellow: '#F2C230',
  toyWhite: '#F5F5F5',
  toyBlack: '#111111',
  toyOutline: '#2A2F38',
  resultDim: '#1E2024',
  resultText: '#B8BCC4',
  scrim: 'rgba(0, 0, 0, 0.45)',
} as const;

/** アプリ名（ログイン・新規登録・ホームの上に出す） */
export const APP_NAME = 'CATCHA!';

export const fontSize = {
  /** アプリ名（本文の2倍） */
  appName: 34,
  title: 24,
  body: 17,
  caption: 14,
  resultTime: 48,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** 押せる部品の最小の大きさ（pt） */
export const MIN_TOUCH = 44;
/** 「ネコを遊ばせる」の高さ */
export const PLAY_BUTTON_HEIGHT = 96;
/** タブレットとみなす短い辺の長さ（pt） */
export const TABLET_MIN_SIDE = 600;

export type ToyPalette = { background: string; toys: string[]; mouse: string; outline: string | null };

/** 遊び画面の色。暗い背景は青・黄・白、明るい背景は青・黄・黒（縁取りつき）。 */
export function toyPalette(background: Background): ToyPalette {
  if (background === 'light') {
    return {
      background: colors.playBgLight,
      toys: [colors.toyBlue, colors.toyYellow, colors.toyBlack],
      mouse: colors.toyBlack,
      // 青・黄色にも縁を付けない（動作確認のときの依頼）
      outline: null,
    };
  }
  return {
    background: colors.playBgDark,
    toys: [colors.toyBlue, colors.toyYellow, colors.toyWhite],
    mouse: colors.toyWhite,
    outline: null,
  };
}
