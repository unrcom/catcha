/** 飼い主の画面で使う、共通の小さな部品（見出し・ボタン・エラー表示）。NFR6 */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fontSize, MIN_TOUCH, spacing } from './theme';

export function Heading({ children, testID }: { children: React.ReactNode; testID?: string }) {
  return (
    <Text accessibilityRole="header" style={styles.heading} testID={testID}>
      {children}
    </Text>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  testID: string;
  disabled?: boolean;
  loading?: boolean;
  /** 読み込み中のボタンの文字（例：「ログイン中…」） */
  loadingLabel?: string;
  variant?: 'primary' | 'secondary' | 'link';
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

export function Button({
  label,
  onPress,
  testID,
  disabled = false,
  loading = false,
  loadingLabel,
  variant = 'primary',
  style,
  accessibilityHint,
}: ButtonProps) {
  const inactive = disabled || loading;
  const shown = loading && loadingLabel ? loadingLabel : label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={shown}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'link' && styles.link,
        inactive && styles.inactive,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={styles.buttonInner}>
        {loading ? <ActivityIndicator color={variant === 'primary' ? colors.onPrimary : colors.primary} /> : null}
        <Text
          style={[
            styles.buttonText,
            variant === 'primary' ? styles.primaryText : styles.secondaryText,
            variant === 'link' && styles.linkText,
          ]}
        >
          {shown}
        </Text>
      </View>
    </Pressable>
  );
}

/** エラーは色だけでなく、印（!）と文章で示す。 */
export function ErrorMessage({ message, testID }: { message: string; testID?: string }) {
  return (
    <View style={styles.errorRow} accessibilityRole="alert" accessibilityLiveRegion="polite" testID={testID}>
      <Text style={styles.errorMark} accessibilityElementsHidden importantForAccessibility="no">
        !
      </Text>
      <Text style={styles.errorText} accessibilityLabel={`エラー：${message}`}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: fontSize.title, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  button: {
    minHeight: MIN_TOUCH,
    minWidth: MIN_TOUCH,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  primary: { backgroundColor: colors.primary },
  secondary: { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.surface },
  link: { backgroundColor: 'transparent' },
  inactive: { opacity: 0.6 },
  pressed: { opacity: 0.8 },
  buttonText: { fontSize: fontSize.body, fontWeight: '600' },
  primaryText: { color: colors.onPrimary },
  secondaryText: { color: colors.primary },
  linkText: { textDecorationLine: 'underline' },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.xs },
  errorMark: {
    color: colors.surface,
    backgroundColor: colors.error,
    fontWeight: '700',
    width: 20,
    height: 20,
    borderRadius: 10,
    textAlign: 'center',
    fontSize: fontSize.caption,
    lineHeight: 20,
    overflow: 'hidden',
  },
  errorText: { flex: 1, color: colors.error, fontSize: fontSize.caption + 1 },
});
