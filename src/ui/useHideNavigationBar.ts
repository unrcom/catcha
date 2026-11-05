/**
 * Android の画面下の操作用の線（ナビゲーションバー）を、この画面にいる間だけ隠す（FR2.5, NFR1）。
 * 画面の下の端からなぞると一時的に出てくる（端末の決まり）。iOS では何もしない。
 */
import * as NavigationBar from 'expo-navigation-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

export function useHideNavigationBar(): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    NavigationBar.setVisibilityAsync('hidden').catch((error) =>
      console.warn('[navigation-bar] could not hide', error),
    );
    return () => {
      NavigationBar.setVisibilityAsync('visible').catch((error) =>
        console.warn('[navigation-bar] could not show again', error),
      );
    };
  }, []);
}
