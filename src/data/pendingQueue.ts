/**
 * 送れていない記録の端末内保存と送り直し（FR7.1〜FR7.4, NFR4, FR1.3）。
 *
 * - 記録はまず端末に書き、そのあとで送る。アプリが途中で閉じても記録は残る（NFR4）。
 * - 通信がないときは送らずに「保存待ち」にする（FR7.1）。
 * - 自動の送り直しが続けて MAX_RETRY_FAILURES 回失敗したら「保存できていない」にする（FR7.3）。
 *   最初の1回の送信の失敗は「送り直し」に数えない。通信がなく送らなかったときも数えない。
 * - 各記録は送ったアカウント（userId）を持ち、そのアカウントのときだけ送る。
 *   ログアウトでは全部消すので、別のアカウントに送られることはない（FR1.3）。
 * - 同じ記録を二度送っても、サーバー側の (user_id, client_id) の一意制約で1件のまま（FR5.3）。
 */
import type { NewRecord } from '../domain/records';
import type { NetworkStatus } from './network';
import type { KeyValueStorage } from './settingsStore';

export const PENDING_STORAGE_KEY = 'nekoui.pending.v1';
export const MAX_RETRY_FAILURES = 3;
export const AUTO_RETRY_INTERVAL_MS = 30_000;

export type PendingEntry = NewRecord & { userId: string; failures: number };
export type SaveStatus = 'saved' | 'pending' | 'failed';

export type RetryResult = {
  /** 通信できて、送る処理をしたか */
  attempted: boolean;
  sent: number;
  remaining: number;
  hasFailed: boolean;
};

export type PendingQueueDeps = {
  storage: KeyValueStorage;
  send: (userId: string, record: NewRecord) => Promise<void>;
  isOnline: () => Promise<boolean>;
  maxFailures?: number;
};

function isPendingEntry(value: unknown): value is PendingEntry {
  const v = value as PendingEntry;
  return (
    !!v &&
    typeof v.clientId === 'string' &&
    typeof v.userId === 'string' &&
    typeof v.playedAt === 'string' &&
    typeof v.durationMs === 'number' &&
    typeof v.failures === 'number'
  );
}

export class PendingQueue {
  private readonly maxFailures: number;
  private readonly sentClientIds = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: PendingQueueDeps) {
    this.maxFailures = deps.maxFailures ?? MAX_RETRY_FAILURES;
  }

  /** 遊びの終わりに呼ぶ。端末に書いてから、通信できれば1回送る。 */
  save(userId: string, record: NewRecord): Promise<SaveStatus> {
    return this.serialize(async () => {
      if (this.sentClientIds.has(record.clientId)) return 'saved';
      const entries = await this.read();
      const existing = entries.find((e) => e.clientId === record.clientId);
      if (!existing) {
        entries.push({ ...record, userId, failures: 0 });
        await this.write(entries);
        this.notify();
      }
      if (!(await this.deps.isOnline())) return this.statusFromEntry(existing ?? entries[entries.length - 1]);
      try {
        await this.deps.send(userId, record);
      } catch (error) {
        console.warn('[pending] first send failed; kept on device', error);
        return this.statusFromEntry(existing ?? entries[entries.length - 1]);
      }
      await this.markSent(record.clientId);
      return 'saved';
    });
  }

  /** このアカウントの送れていない記録を送り直す（自動・ホームの「再試行」の両方）。 */
  retry(userId: string): Promise<RetryResult> {
    return this.serialize(async () => {
      const mine = (await this.read()).filter((e) => e.userId === userId);
      if (mine.length === 0) return { attempted: false, sent: 0, remaining: 0, hasFailed: false };
      if (!(await this.deps.isOnline())) {
        return { attempted: false, sent: 0, remaining: mine.length, hasFailed: this.anyFailed(mine) };
      }
      let sent = 0;
      for (const entry of mine) {
        const { userId: owner, failures: _f, ...record } = entry;
        try {
          await this.deps.send(owner, record);
          await this.markSent(entry.clientId);
          sent += 1;
        } catch (error) {
          console.warn('[pending] retry failed', { clientId: entry.clientId, failures: entry.failures + 1 }, error);
          await this.incrementFailures(entry.clientId);
        }
      }
      const remaining = (await this.read()).filter((e) => e.userId === userId);
      this.notify();
      return { attempted: true, sent, remaining: remaining.length, hasFailed: this.anyFailed(remaining) };
    });
  }

  /** 結果画面で使う、1件の記録の保存状態。端末にもなく送った覚えもなければ null。 */
  async statusOf(clientId: string): Promise<SaveStatus | null> {
    if (this.sentClientIds.has(clientId)) return 'saved';
    const entry = (await this.read()).find((e) => e.clientId === clientId);
    return entry ? this.statusFromEntry(entry) : null;
  }

  async count(userId: string): Promise<number> {
    return (await this.read()).filter((e) => e.userId === userId).length;
  }

  async hasFailed(userId: string): Promise<boolean> {
    return this.anyFailed((await this.read()).filter((e) => e.userId === userId));
  }

  /** ログアウトで呼ぶ。端末の送れていない記録をすべて消す（FR1.3）。 */
  clearAll(): Promise<void> {
    return this.serialize(async () => {
      await this.deps.storage.removeItem(PENDING_STORAGE_KEY);
      this.notify();
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private statusFromEntry(entry: PendingEntry | undefined): SaveStatus {
    if (!entry) return 'pending';
    return entry.failures >= this.maxFailures ? 'failed' : 'pending';
  }

  private anyFailed(entries: PendingEntry[]): boolean {
    return entries.some((e) => e.failures >= this.maxFailures);
  }

  private async markSent(clientId: string): Promise<void> {
    this.sentClientIds.add(clientId);
    await this.write((await this.read()).filter((e) => e.clientId !== clientId));
    this.notify();
  }

  private async incrementFailures(clientId: string): Promise<void> {
    const entries = await this.read();
    await this.write(entries.map((e) => (e.clientId === clientId ? { ...e, failures: e.failures + 1 } : e)));
  }

  private async read(): Promise<PendingEntry[]> {
    const raw = await this.deps.storage.getItem(PENDING_STORAGE_KEY);
    if (raw === null) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('not an array');
      return parsed.filter(isPendingEntry);
    } catch (error) {
      console.error('[pending] stored queue is unreadable', error);
      return [];
    }
  }

  private async write(entries: PendingEntry[]): Promise<void> {
    await this.deps.storage.setItem(PENDING_STORAGE_KEY, JSON.stringify(entries));
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  /** 端末の読み書きを1つずつ順に行い、同じ記録の二重送信や書き込みの取り違えを防ぐ。 */
  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task);
    this.chain = run.catch(() => undefined);
    return run;
  }
}

/**
 * 自動の送り直し：通信が戻ったとき・一定間隔ごと（通信できて、記録が残っているとき）。
 * 止める関数を返す。
 */
export function startAutoRetry(
  queue: PendingQueue,
  options: { userId: string; network: NetworkStatus; intervalMs?: number },
): () => void {
  const { userId, network } = options;
  const tryRetry = () => {
    queue.retry(userId).catch((error) => console.warn('[pending] auto retry failed', error));
  };
  const unsubscribe = network.subscribe((online) => {
    if (online) tryRetry();
  });
  const timer = setInterval(async () => {
    try {
      if ((await queue.count(userId)) > 0 && (await network.isOnline())) tryRetry();
    } catch (error) {
      console.warn('[pending] auto retry check failed', error);
    }
  }, options.intervalMs ?? AUTO_RETRY_INTERVAL_MS);
  tryRetry();
  return () => {
    unsubscribe();
    clearInterval(timer);
  };
}
