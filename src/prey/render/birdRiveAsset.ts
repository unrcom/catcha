/**
 * Rive の小鳥のファイル（FR2.9）。`assets/rive/bird.riv` は Rive のエディタで作るもので、まだない。
 *
 * ファイルがないのに `require` を書くと、Metro が束ねるときに止まってしまう（アプリが作れない）。
 * そのため、ファイルを置くまではここを null にしておき、小鳥は Skia で描く。
 *
 * bird.riv を置いたら：
 *   1. 下の null を `require('../../../assets/rive/bird.riv')` に替える
 *   2. Metro が .riv を読めるよう、`metro.config.js` の `resolver.assetExts` に 'riv' を足す
 *   3. `EXPO_PUBLIC_BIRD_RIVE=1` を付けてビルドする（付けなければ Skia で描く）
 * 小鳥の絵は右向き・アートボードの真ん中に置き、自動で再生するアニメーション（またはステートマシン）を 1 つ持たせる。
 */
export const BIRD_RIVE_SOURCE: number | null = null;
