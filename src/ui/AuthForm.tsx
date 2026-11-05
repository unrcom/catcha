/**
 * ログイン（S1）と新規登録（S1b）の入力欄とボタン（FR1.1, FR1.2, FR1.4, NFR6）。
 * - 入力欄の上に見える見出し、入力エラーは欄の下に印（!）と文章
 * - ログインの失敗・通信エラーはフォームの上に文章で出し、通信エラーには「再試行」
 */
import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { AuthResult } from '../data/authRepository';
import { hasErrors, validateCredentials, type FieldErrors } from '../domain/validation';
import { Button, ErrorMessage, Heading } from './controls';
import { APP_NAME, colors, fontSize, MIN_TOUCH, spacing } from './theme';

type Mode = 'login' | 'register';

const TEXT: Record<Mode, { heading: string; submit: string; busy: string; switchLabel: string }> = {
  login: { heading: 'ログイン', submit: 'ログイン', busy: 'ログイン中…', switchLabel: '新規登録はこちら' },
  register: { heading: '新規登録', submit: '登録する', busy: '登録中…', switchLabel: 'ログインに戻る' },
};

type Props = {
  mode: Mode;
  onSubmit: (email: string, password: string) => Promise<AuthResult>;
  onSuccess: (userId: string) => void;
  onSwitchMode: () => void;
};

export function AuthForm({ mode, onSubmit, onSuccess, onSwitchMode }: Props) {
  const text = TEXT[mode];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  async function submit() {
    if (busy) return;
    const errors = validateCredentials(email, password);
    setFieldErrors(errors);
    setFormError(null);
    if (hasErrors(errors)) return;
    setBusy(true);
    try {
      const result = await onSubmit(email.trim(), password);
      if (result.ok) {
        onSuccess(result.userId);
        return;
      }
      setFormError({ message: result.message, retryable: result.error === 'network' });
    } catch (error) {
      console.warn('[auth-form] submit failed', error);
      setFormError({ message: 'うまくいきませんでした。もう一度お試しください', retryable: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          <Text style={styles.appName}>{APP_NAME}</Text>
          <Heading testID={`${mode}-heading`}>{text.heading}</Heading>

          {formError ? (
            <View style={styles.formError} testID={`${mode}-form-error`}>
              <ErrorMessage message={formError.message} />
              {formError.retryable ? (
                <Button label="再試行" onPress={submit} variant="secondary" testID={`${mode}-retry-button`} style={styles.retry} />
              ) : null}
            </View>
          ) : null}

          <Text style={styles.label} nativeID={`${mode}-email-label`}>
            メールアドレス
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType={mode === 'login' ? 'username' : 'emailAddress'}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            accessibilityLabel="メールアドレス"
            accessibilityLabelledBy={`${mode}-email-label`}
            style={[styles.input, fieldErrors.email && styles.inputError]}
            testID={`${mode}-email-input`}
          />
          {fieldErrors.email ? <ErrorMessage message={fieldErrors.email} testID={`${mode}-email-error`} /> : null}

          <Text style={[styles.label, styles.spaced]} nativeID={`${mode}-password-label`}>
            パスワード
          </Text>
          <View style={styles.passwordRow}>
            <TextInput
              ref={passwordRef}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              textContentType={mode === 'login' ? 'password' : 'newPassword'}
              returnKeyType="done"
              onSubmitEditing={submit}
              accessibilityLabel="パスワード"
              accessibilityLabelledBy={`${mode}-password-label`}
              style={[styles.input, styles.passwordInput, fieldErrors.password && styles.inputError]}
              testID={`${mode}-password-input`}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'パスワードを隠す' : 'パスワードを表示する'}
              onPress={() => setShowPassword((v) => !v)}
              style={styles.eye}
              testID={`${mode}-password-toggle`}
            >
              <Text style={styles.eyeText}>{showPassword ? '隠す' : '表示'}</Text>
            </Pressable>
          </View>
          {fieldErrors.password ? <ErrorMessage message={fieldErrors.password} testID={`${mode}-password-error`} /> : null}
          {mode === 'register' ? <Text style={styles.hint}>8文字以上</Text> : null}

          <Button
            label={text.submit}
            loadingLabel={text.busy}
            loading={busy}
            onPress={submit}
            testID={`${mode}-submit-button`}
            style={styles.submit}
          />
          <Button label={text.switchLabel} onPress={onSwitchMode} variant="link" testID={`${mode}-switch-link`} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface },
  container: { flexGrow: 1, padding: spacing.lg, justifyContent: 'center' },
  inner: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  appName: { fontSize: fontSize.appName, color: colors.textMuted, fontWeight: '700', marginBottom: spacing.sm },
  label: { fontSize: fontSize.body, color: colors.text, marginBottom: spacing.xs },
  spaced: { marginTop: spacing.md },
  input: {
    minHeight: MIN_TOUCH + 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.body,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.error, borderWidth: 2 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  passwordInput: { flex: 1 },
  eye: { minWidth: MIN_TOUCH + 12, minHeight: MIN_TOUCH, justifyContent: 'center', alignItems: 'center' },
  eyeText: { color: colors.primary, fontSize: fontSize.body },
  hint: { color: colors.textMuted, fontSize: fontSize.caption, marginTop: spacing.xs },
  formError: {
    backgroundColor: colors.errorSurface,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  retry: { alignSelf: 'flex-start' },
  submit: { marginTop: spacing.lg, marginBottom: spacing.sm },
});
