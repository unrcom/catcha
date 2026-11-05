/**
 * Supabase への接続（NFR5）。URL と公開キーは環境変数から読み、コードには書かない。
 * - EXPO_PUBLIC_SUPABASE_URL
 * - EXPO_PUBLIC_SUPABASE_ANON_KEY
 * パスワードを暗号化された通信でだけ送るため、URL は https に限る。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SupabaseConfig = { url: string; anonKey: string };

export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseConfigError';
  }
}

type Env = Record<string, string | undefined>;

/** 環境変数から接続先を読み、足りなければ分かる文でエラーにする。 */
export function readSupabaseConfig(env: Env): SupabaseConfig {
  const url = env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const missing = [
    !url && 'EXPO_PUBLIC_SUPABASE_URL',
    !anonKey && 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new SupabaseConfigError(
      `Supabase の設定がありません: ${missing.join(', ')} を .env に書いてください（.env.example を参照）`,
    );
  }
  if (!/^https:\/\//i.test(url!)) {
    throw new SupabaseConfigError(
      'EXPO_PUBLIC_SUPABASE_URL は https:// で始まる URL にしてください（パスワードを暗号化された通信でだけ送るため）',
    );
  }
  return { url: url!, anonKey: anonKey! };
}

/** 設定から Supabase のクライアントを作る。セッションは端末内（AsyncStorage）に保つ。 */
export function createSupabaseClient(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

let sharedClient: SupabaseClient | null = null;

/** アプリ全体で使うクライアント。Expo はビルド時に EXPO_PUBLIC_ の値を埋め込む。 */
export function getSupabase(): SupabaseClient {
  if (!sharedClient) {
    sharedClient = createSupabaseClient(
      readSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      }),
    );
  }
  return sharedClient;
}

/** 通信の失敗かどうか（fetch が届かなかった・タイムアウトなど）を見分ける。 */
export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; message?: string; status?: number };
  if (e.name === 'AuthRetryableFetchError') return true;
  if (e.name === 'TypeError' && /network|fetch/i.test(e.message ?? '')) return true;
  return /network request failed|failed to fetch|fetch failed|network error|timeout/i.test(e.message ?? '');
}
