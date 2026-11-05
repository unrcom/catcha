/** 通信の状態（NetInfo を包む）。FR2.7, FR7.1, FR7.2 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

export type NetworkStatus = {
  isOnline(): Promise<boolean>;
  subscribe(listener: (online: boolean) => void): () => void;
};

export function isOnlineState(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  // isInternetReachable は確かめ中だと null。はっきり false のときだけ「つながっていない」とする
  return state.isConnected === true && state.isInternetReachable !== false;
}

export const netInfoNetwork: NetworkStatus = {
  async isOnline() {
    try {
      return isOnlineState(await NetInfo.fetch());
    } catch (error) {
      console.warn('[network] NetInfo.fetch failed; assuming offline', error);
      return false;
    }
  },
  subscribe(listener) {
    return NetInfo.addEventListener((state) => listener(isOnlineState(state)));
  },
};
