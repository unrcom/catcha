import AsyncStorage from '@react-native-async-storage/async-storage';

import type { NewRecord } from '../../src/domain/records';
import type { NetworkStatus } from '../../src/data/network';
import {
  MAX_RETRY_FAILURES,
  PENDING_STORAGE_KEY,
  PendingQueue,
  startAutoRetry,
} from '../../src/data/pendingQueue';

/** 通信のオン・オフと、サーバーの失敗を切り替えられる偽物。 */
function createWorld() {
  const server: Array<{ userId: string } & NewRecord> = [];
  const state = { online: true, serverFails: false };
  const listeners = new Set<(online: boolean) => void>();
  const network: NetworkStatus = {
    isOnline: async () => state.online,
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  const send = jest.fn(async (userId: string, record: NewRecord) => {
    if (!state.online) throw new TypeError('Network request failed');
    if (state.serverFails) throw new Error('server error');
    if (!server.some((r) => r.userId === userId && r.clientId === record.clientId)) {
      server.push({ userId, ...record });
    }
  });
  const makeQueue = () => new PendingQueue({ storage: AsyncStorage, send, isOnline: network.isOnline });
  const setOnline = (online: boolean) => {
    state.online = online;
    listeners.forEach((l) => l(online));
  };
  return { server, state, network, send, makeQueue, setOnline };
}

const record = (clientId: string): NewRecord => ({
  clientId,
  playedAt: '2026-11-03T11:15:00.000Z',
  durationMs: 300_000,
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('PendingQueue', () => {
  it('sends right away when online and leaves nothing on the device (FR5.3)', async () => {
    const world = createWorld();
    const queue = world.makeQueue();
    expect(await queue.save('u1', record('c1'))).toBe('saved');
    expect(world.server).toHaveLength(1);
    expect(await queue.count('u1')).toBe(0);
    expect(await queue.statusOf('c1')).toBe('saved');
  });

  it('keeps the record on the device when offline and shows it as pending (FR7.1)', async () => {
    const world = createWorld();
    world.state.online = false;
    const queue = world.makeQueue();
    expect(await queue.save('u1', record('c1'))).toBe('pending');
    expect(world.send).not.toHaveBeenCalled();
    expect(JSON.parse((await AsyncStorage.getItem(PENDING_STORAGE_KEY))!)).toHaveLength(1);
  });

  it('survives an app restart and is sent when the connection returns (NFR4, FR7.2)', async () => {
    const world = createWorld();
    world.state.online = false;
    await world.makeQueue().save('u1', record('c1'));

    // アプリを閉じて開き直す = 新しいインスタンス（端末の保存はそのまま）
    const reopened = world.makeQueue();
    expect(await reopened.count('u1')).toBe(1);
    const stop = startAutoRetry(reopened, { userId: 'u1', network: world.network, intervalMs: 60_000 });
    await flush();
    expect(world.server).toHaveLength(0);

    world.setOnline(true);
    await flush();
    await flush();
    stop();

    expect(world.server.map((r) => r.clientId)).toEqual(['c1']);
    expect(await reopened.count('u1')).toBe(0);
    expect(await reopened.statusOf('c1')).toBe('saved');
  });

  it(`becomes "failed" after ${MAX_RETRY_FAILURES} retries fail in a row, and a later retry clears it (FR7.3, FR7.4)`, async () => {
    const world = createWorld();
    world.state.serverFails = true;
    const queue = world.makeQueue();
    expect(await queue.save('u1', record('c1'))).toBe('pending'); // 最初の送信の失敗は数えない

    for (let i = 1; i < MAX_RETRY_FAILURES; i += 1) {
      expect(await queue.retry('u1')).toMatchObject({ attempted: true, hasFailed: false });
    }
    expect(await queue.retry('u1')).toMatchObject({ attempted: true, sent: 0, remaining: 1, hasFailed: true });
    expect(await queue.hasFailed('u1')).toBe(true);
    expect(await queue.statusOf('c1')).toBe('failed');

    world.state.serverFails = false;
    expect(await queue.retry('u1')).toMatchObject({ attempted: true, sent: 1, remaining: 0, hasFailed: false });
    expect(await queue.hasFailed('u1')).toBe(false);
  });

  it('does not count a retry while offline as a failure', async () => {
    const world = createWorld();
    world.state.online = false;
    const queue = world.makeQueue();
    await queue.save('u1', record('c1'));
    for (let i = 0; i < 5; i += 1) {
      expect(await queue.retry('u1')).toMatchObject({ attempted: false, remaining: 1 });
    }
    expect(await queue.hasFailed('u1')).toBe(false);
  });

  it('is cleared on logout and never sent to another account (FR1.3)', async () => {
    const world = createWorld();
    world.state.online = false;
    const queue = world.makeQueue();
    await queue.save('u1', record('c1'));
    await queue.save('u1', record('c2'));
    expect(await queue.count('u1')).toBe(2);

    await queue.clearAll();
    world.state.online = true;
    expect(await queue.retry('u2')).toMatchObject({ sent: 0, remaining: 0 });
    expect(await queue.retry('u1')).toMatchObject({ sent: 0, remaining: 0 });
    expect(world.server).toHaveLength(0);
    expect(await AsyncStorage.getItem(PENDING_STORAGE_KEY)).toBeNull();
  });

  it('only sends a record for the account that made it', async () => {
    const world = createWorld();
    world.state.online = false;
    const queue = world.makeQueue();
    await queue.save('u1', record('c1'));
    world.state.online = true;
    expect(await queue.retry('u2')).toMatchObject({ attempted: false, sent: 0 });
    expect(world.server).toHaveLength(0);
  });

  it('saves the same session only once even if called twice (FR5.3)', async () => {
    const world = createWorld();
    const queue = world.makeQueue();
    await Promise.all([queue.save('u1', record('c1')), queue.save('u1', record('c1'))]);
    expect(world.send).toHaveBeenCalledTimes(1);
    expect(world.server).toHaveLength(1);
  });
});
