import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';

import LoginScreen from '../../app/login';
import RegisterScreen from '../../app/register';
import { AUTH_MESSAGES } from '../../src/data/authRepository';
import { makeHarness, renderWithApp } from '../helpers/appHarness';
import { mockRouter, resetRouter } from '../helpers/routerMock';

jest.mock('expo-router', () => require('../helpers/routerMock'));

beforeEach(async () => {
  await AsyncStorage.clear();
  resetRouter();
});

async function fillIn(prefix: 'login' | 'register', email: string, password: string) {
  await fireEvent.changeText(screen.getByTestId(`${prefix}-email-input`), email);
  await fireEvent.changeText(screen.getByTestId(`${prefix}-password-input`), password);
  await fireEvent.press(screen.getByTestId(`${prefix}-submit-button`));
}

describe('S1 ログイン', () => {
  it('has a heading and labelled inputs (NFR6)', async () => {
    await renderWithApp(<LoginScreen />, makeHarness({ userId: null }));
    expect(screen.getByRole('header', { name: 'ログイン' })).toBeOnTheScreen();
    expect(screen.getByText('メールアドレス')).toBeOnTheScreen();
    expect(screen.getByLabelText('パスワード')).toBeOnTheScreen();
  });

  it('shows input errors in words under the fields and does not call the server', async () => {
    const h = makeHarness({ userId: null });
    await renderWithApp(<LoginScreen />, h);
    await fillIn('login', 'cat@example', 'short');
    expect(screen.getByTestId('login-email-error')).toHaveTextContent(/メールアドレスの形が正しくありません/);
    expect(screen.getByTestId('login-password-error')).toHaveTextContent(/8文字以上/);
    expect(h.auth.signIn).not.toHaveBeenCalled();
  });

  it('explains a wrong password in words (FR1.2)', async () => {
    const h = makeHarness({ userId: null });
    h.auth.signIn.mockResolvedValue({ ok: false, error: 'invalid-credentials', message: AUTH_MESSAGES['invalid-credentials'] });
    await renderWithApp(<LoginScreen />, h);
    await fillIn('login', 'cat@example.com', 'wrongpass1');
    expect(await screen.findByText('メールアドレスかパスワードが違います')).toBeOnTheScreen();
    expect(screen.queryByTestId('login-retry-button')).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('shows a connection error with a retry button that tries again (FR1.4)', async () => {
    const h = makeHarness({ userId: null });
    h.auth.signIn
      .mockResolvedValueOnce({ ok: false, error: 'network', message: AUTH_MESSAGES.network })
      .mockResolvedValueOnce({ ok: true, userId: 'user-1' });
    await renderWithApp(<LoginScreen />, h);
    await fillIn('login', 'cat@example.com', 'password123');

    expect(await screen.findByText(/接続できませんでした/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('login-retry-button'));

    expect(h.auth.signIn).toHaveBeenCalledTimes(2);
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });
});

describe('S1b 新規登録', () => {
  it('registers and goes to home (FR1.1)', async () => {
    const h = makeHarness({ userId: null });
    h.auth.signUp.mockResolvedValue({ ok: true, userId: 'user-9' });
    await renderWithApp(<RegisterScreen />, h);
    expect(screen.getByRole('header', { name: '新規登録' })).toBeOnTheScreen();
    await fillIn('register', ' cat@example.com ', 'password123');
    expect(h.auth.signUp).toHaveBeenCalledWith('cat@example.com', 'password123');
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });
});
