/** メールアドレス・パスワードの入力の確かめ（FR1.1, NFR6）。 */

export const PASSWORD_MIN_LENGTH = 8;
export const EMAIL_MAX_LENGTH = 254;

export type FieldErrors = { email?: string; password?: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | undefined {
  const value = email.trim();
  if (value.length === 0) return 'メールアドレスを入力してください';
  if (value.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(value)) {
    return 'メールアドレスの形が正しくありません';
  }
  return undefined;
}

export function validatePassword(password: string): string | undefined {
  if (password.length === 0) return 'パスワードを入力してください';
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください`;
  }
  return undefined;
}

/** 入力欄ごとのエラー。エラーがなければ空のオブジェクト。 */
export function validateCredentials(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);
  if (emailError) errors.email = emailError;
  if (passwordError) errors.password = passwordError;
  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Boolean(errors.email || errors.password);
}
