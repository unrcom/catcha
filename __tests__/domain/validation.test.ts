import {
  hasErrors,
  validateCredentials,
  validateEmail,
  validatePassword,
} from '../../src/domain/validation';

describe('validation (FR1.1)', () => {
  it('accepts a well-formed email and an 8+ character password', () => {
    const errors = validateCredentials('cat@example.com', 'password123');
    expect(errors).toEqual({});
    expect(hasErrors(errors)).toBe(false);
  });

  it('explains a malformed or empty email in words', () => {
    expect(validateEmail('cat@example')).toBe('メールアドレスの形が正しくありません');
    expect(validateEmail('cat example.com')).toBe('メールアドレスの形が正しくありません');
    expect(validateEmail('   ')).toBe('メールアドレスを入力してください');
  });

  it('explains a short or empty password in words', () => {
    expect(validatePassword('1234567')).toBe('パスワードは8文字以上にしてください');
    expect(validatePassword('')).toBe('パスワードを入力してください');
  });

  it('reports both fields at once', () => {
    const errors = validateCredentials('bad', 'short');
    expect(Object.keys(errors).sort()).toEqual(['email', 'password']);
    expect(hasErrors(errors)).toBe(true);
  });
});
