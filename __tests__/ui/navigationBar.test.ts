import { renderHook } from '@testing-library/react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { Platform } from 'react-native';

import { useHideNavigationBar } from '../../src/ui/useHideNavigationBar';

const setVisibility = NavigationBar.setVisibilityAsync as jest.Mock;

describe('useHideNavigationBar (FR2.5)', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS });
    setVisibility.mockClear();
  });

  it('hides the Android navigation bar while the screen is shown, and shows it again when leaving', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    const { unmount } = await renderHook(() => useHideNavigationBar());
    expect(setVisibility).toHaveBeenLastCalledWith('hidden');
    await unmount();
    expect(setVisibility).toHaveBeenLastCalledWith('visible');
  });

  it('does nothing on iOS', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    const { unmount } = await renderHook(() => useHideNavigationBar());
    await unmount();
    expect(setVisibility).not.toHaveBeenCalled();
  });

  it('keeps going when the bar cannot be hidden', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    setVisibility.mockImplementationOnce(() => Promise.reject(new Error('not supported')));
    const { unmount } = await renderHook(() => useHideNavigationBar());
    await Promise.resolve();
    expect(warn).toHaveBeenCalledWith('[navigation-bar] could not hide', expect.any(Error));
    await unmount();
    warn.mockRestore();
  });
});
