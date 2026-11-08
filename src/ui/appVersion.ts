/**
 * ホーム画面の隅に出す、アプリの版とビルド番号（例：`v0.1.0 (2)`）。
 * - 版（`version`）は git のタグと同じ。版を作り終えて main に取り込んだときに上げる
 * - ビルド番号（iOS は `ios.buildNumber`、Android は `android.versionCode`）は、人の端末に入れるビルドを作るたびに上げる
 * どちらも `app.json` に書き、ビルドのときにアプリに入る（expo-constants の expoConfig から読む）。
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

type VersionConfig = {
  version?: string;
  ios?: { buildNumber?: string };
  android?: { versionCode?: number };
} | null | undefined;

/** 版とビルド番号を 1 行の文字にする。分からない部分は出さない。 */
export function formatAppVersion(config: VersionConfig, os: string): string {
  const version = config?.version ? `v${config.version}` : 'v?';
  const build = os === 'android' ? config?.android?.versionCode : os === 'ios' ? config?.ios?.buildNumber : undefined;
  return build === undefined || build === '' ? version : `${version} (${build})`;
}

/** この端末で動いているアプリの版とビルド番号。 */
export function appVersionLabel(): string {
  return formatAppVersion(Constants.expoConfig as VersionConfig, Platform.OS);
}
