/**
 * アカウントの登録・ログイン・ログアウト（FR1.1〜FR1.4, NFR5）。
 * 失敗は画面にそのまま出せる日本語の文と種類に分ける。
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { isNetworkError } from './supabase';

export type AuthErrorKind =
  | 'invalid-credentials'
  | 'network'
  | 'email-taken'
  | 'weak-password'
  | 'invalid-email'
  | 'confirmation-required'
  | 'unknown';

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; error: AuthErrorKind; message: string };

export const AUTH_MESSAGES: Record<AuthErrorKind, string> = {
  'invalid-credentials': 'メールアドレスかパスワードが違います',
  network: '接続できませんでした。通信状態を確認して、もう一度お試しください',
  'email-taken': 'このメールアドレスはすでに登録されています',
  'weak-password': 'このパスワードは使えません。別のパスワードにしてください',
  'invalid-email': 'メールアドレスの形が正しくありません',
  'confirmation-required': '確認のメールを送りました。メールのリンクを開いてから、ログインしてください',
  unknown: 'うまくいきませんでした。もう一度お試しください',
};

type MaybeAuthError = { name?: string; message?: string; status?: number; code?: string };

/** Supabase の認証エラーを、画面で分けて出す種類にする。 */
export function classifyAuthError(error: unknown): AuthErrorKind {
  if (isNetworkError(error)) return 'network';
  const e = (error ?? {}) as MaybeAuthError;
  switch (e.code) {
    case 'invalid_credentials':
      return 'invalid-credentials';
    case 'user_already_exists':
    case 'email_exists':
      return 'email-taken';
    case 'weak_password':
      return 'weak-password';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'invalid-email';
    case 'email_not_confirmed':
      return 'confirmation-required';
    default:
      break;
  }
  if (/invalid login credentials/i.test(e.message ?? '')) return 'invalid-credentials';
  if (/already registered/i.test(e.message ?? '')) return 'email-taken';
  return 'unknown';
}

function failure(kind: AuthErrorKind): AuthResult {
  return { ok: false, error: kind, message: AUTH_MESSAGES[kind] };
}

export type AuthRepository = {
  signUp(email: string, password: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<{ ok: true } | { ok: false; message: string }>;
  getCurrentUserId(): Promise<string | null>;
  onUserChange(listener: (userId: string | null) => void): () => void;
};

export function createAuthRepository(client: SupabaseClient): AuthRepository {
  async function run(action: () => Promise<{ data: unknown; error: unknown }>, operation: string) {
    try {
      return await action();
    } catch (thrown) {
      // fetch 自体が投げた失敗（通信なしなど）
      console.warn(`[auth] ${operation} threw`, thrown);
      return { data: null, error: thrown };
    }
  }

  return {
    async signUp(email, password) {
      const { data, error } = await run(() => client.auth.signUp({ email, password }), 'signUp');
      if (error) return failure(classifyAuthError(error));
      const d = data as { user: { id: string } | null; session: unknown };
      if (!d.user) return failure('unknown');
      // 確認メールが有効なプロジェクトでは、ここではまだセッションがない
      if (!d.session) return failure('confirmation-required');
      return { ok: true, userId: d.user.id };
    },

    async signIn(email, password) {
      const { data, error } = await run(
        () => client.auth.signInWithPassword({ email, password }),
        'signIn',
      );
      if (error) return failure(classifyAuthError(error));
      const d = data as { user: { id: string } | null };
      if (!d.user) return failure('unknown');
      return { ok: true, userId: d.user.id };
    },

    async signOut() {
      // scope: 'local' はこの端末のセッションだけを消す（通信がなくても端末の状態は消える）
      const { error } = await run(
        async () => ({ data: null, error: (await client.auth.signOut({ scope: 'local' })).error }),
        'signOut',
      );
      if (error) {
        console.warn('[auth] signOut failed', error);
        return { ok: false, message: 'ログアウトできませんでした。もう一度お試しください' };
      }
      return { ok: true };
    },

    async getCurrentUserId() {
      const { data, error } = await client.auth.getSession();
      if (error) {
        console.warn('[auth] getSession failed', error);
        return null;
      }
      return data.session?.user.id ?? null;
    },

    onUserChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        listener(session?.user.id ?? null);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
