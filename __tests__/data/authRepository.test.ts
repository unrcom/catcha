import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { AUTH_MESSAGES, createAuthRepository } from '../../src/data/authRepository';
import {
  createSupabaseClient,
  readSupabaseConfig,
  SupabaseConfigError,
} from '../../src/data/supabase';
import { authApiError, createFakeSupabase, retryableFetchError } from '../helpers/fakeSupabase';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ marker: 'client' })) }));

const EMAIL = 'cat@example.com';
const PASSWORD = 'password123';

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('Supabase connection settings (NFR5)', () => {
  it('reads the URL and key from the environment and creates the client with device storage', () => {
    const config = readSupabaseConfig({
      EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
    });
    createSupabaseClient(config);
    expect(createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'public-anon-key',
      expect.objectContaining({
        auth: expect.objectContaining({ storage: AsyncStorage, persistSession: true }),
      }),
    );
  });

  it('fails with a clear message naming the missing variables', () => {
    expect(() => readSupabaseConfig({})).toThrow(SupabaseConfigError);
    expect(() => readSupabaseConfig({ EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' })).toThrow(
      /EXPO_PUBLIC_SUPABASE_ANON_KEY/,
    );
  });

  it('refuses a URL that is not https so passwords are only sent encrypted', () => {
    expect(() =>
      readSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_URL: 'http://example.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'k',
      }),
    ).toThrow(/https/);
  });
});

describe('authRepository', () => {
  it('registers a new account and returns the user id (FR1.1)', async () => {
    const { client, auth } = createFakeSupabase();
    auth.signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: { access_token: 't' } }, error: null });
    const result = await createAuthRepository(client).signUp(EMAIL, PASSWORD);
    expect(result).toEqual({ ok: true, userId: 'u1' });
    expect(auth.signUp).toHaveBeenCalledWith({ email: EMAIL, password: PASSWORD });
  });

  it('reports an already registered email and a required confirmation separately (FR1.1)', async () => {
    const { client, auth } = createFakeSupabase();
    const repo = createAuthRepository(client);
    auth.signUp.mockResolvedValueOnce({ data: { user: null, session: null }, error: authApiError('user_already_exists', 'User already registered', 422) });
    expect(await repo.signUp(EMAIL, PASSWORD)).toMatchObject({ ok: false, error: 'email-taken' });
    auth.signUp.mockResolvedValueOnce({ data: { user: { id: 'u1' }, session: null }, error: null });
    expect(await repo.signUp(EMAIL, PASSWORD)).toMatchObject({ ok: false, error: 'confirmation-required' });
  });

  it('logs in with the right combination (FR1.2)', async () => {
    const { client, auth } = createFakeSupabase();
    auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1' }, session: {} }, error: null });
    expect(await createAuthRepository(client).signIn(EMAIL, PASSWORD)).toEqual({ ok: true, userId: 'u1' });
  });

  it('separates a wrong password from a connection failure (FR1.2, FR1.4)', async () => {
    const { client, auth } = createFakeSupabase();
    const repo = createAuthRepository(client);

    auth.signInWithPassword.mockResolvedValueOnce({ data: { user: null, session: null }, error: authApiError('invalid_credentials', 'Invalid login credentials') });
    expect(await repo.signIn(EMAIL, 'wrong-pass')).toEqual({
      ok: false,
      error: 'invalid-credentials',
      message: 'メールアドレスかパスワードが違います',
    });

    auth.signInWithPassword.mockResolvedValueOnce({ data: { user: null, session: null }, error: retryableFetchError() });
    expect(await repo.signIn(EMAIL, PASSWORD)).toEqual({ ok: false, error: 'network', message: AUTH_MESSAGES.network });

    auth.signInWithPassword.mockRejectedValueOnce(new TypeError('Network request failed'));
    expect(await repo.signIn(EMAIL, PASSWORD)).toMatchObject({ ok: false, error: 'network' });
    expect(AUTH_MESSAGES.network).toContain('接続できませんでした');
  });

  it('logs out only this device and reports a failure (FR1.3)', async () => {
    const { client, auth } = createFakeSupabase();
    const repo = createAuthRepository(client);
    auth.signOut.mockResolvedValueOnce({ error: null });
    expect(await repo.signOut()).toEqual({ ok: true });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    auth.signOut.mockResolvedValueOnce({ error: new Error('boom') });
    expect(await repo.signOut()).toMatchObject({ ok: false });
  });

  it('reads the signed-in user from the stored session', async () => {
    const { client, auth } = createFakeSupabase();
    auth.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'u9' } } }, error: null });
    expect(await createAuthRepository(client).getCurrentUserId()).toBe('u9');
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    expect(await createAuthRepository(client).getCurrentUserId()).toBeNull();
  });
});
