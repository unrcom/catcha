import { formatAppVersion } from '../../src/ui/appVersion';

describe('アプリの版とビルド番号の表示', () => {
  const config = { version: '0.1.0', ios: { buildNumber: '2' }, android: { versionCode: 3 } };

  it('shows the version and the iOS build number on iOS', () => {
    expect(formatAppVersion(config, 'ios')).toBe('v0.1.0 (2)');
  });

  it('shows the Android version code on Android', () => {
    expect(formatAppVersion(config, 'android')).toBe('v0.1.0 (3)');
  });

  it('shows only the version when there is no build number', () => {
    expect(formatAppVersion({ version: '0.1.0' }, 'ios')).toBe('v0.1.0');
    expect(formatAppVersion(config, 'web')).toBe('v0.1.0');
  });

  it('does not crash without a config', () => {
    expect(formatAppVersion(null, 'ios')).toBe('v?');
  });
});
