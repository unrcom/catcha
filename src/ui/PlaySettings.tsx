/**
 * 遊びの設定（interaction-spec.md の PlaySettings。FR2.6, FR4.2。v0.1 で獲物の数 FR5.1 を足した）。
 * 変えた時点で保存し、次の遊びから使う。
 */
import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import {
  IDLE_SECONDS_OPTIONS,
  PREY_COUNT_OPTIONS,
  type Background,
  type IdleSeconds,
  type PlaySettings as Settings,
} from '../data/settingsStore';
import { colors, fontSize, MIN_TOUCH, spacing } from './theme';

const IDLE_LABELS: Record<IdleSeconds, string> = { 30: '30秒', 60: '1分', 120: '2分', 300: '5分' };
const BACKGROUND_LABELS: Record<Background, string> = { dark: '暗い', light: '明るい' };

type Props = {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
};

type SegmentProps<T extends string | number> = {
  label: string;
  options: readonly T[];
  value: T;
  optionLabel: (v: T) => string;
  onSelect: (v: T) => void;
  testIDPrefix: string;
};

function Segmented<T extends string | number>({ label, options, value, optionLabel, onSelect, testIDPrefix }: SegmentProps<T>) {
  return (
    <View style={styles.group}>
      <Text style={styles.label} nativeID={`${testIDPrefix}-label`}>
        {label}
      </Text>
      <View style={styles.segments} accessibilityRole="radiogroup" accessibilityLabel={label} testID={`${testIDPrefix}-group`}>
        {options.map((option) => {
          const selected = option === value;
          return (
            <Pressable
              key={String(option)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${label} ${optionLabel(option)}`}
              onPress={() => onSelect(option)}
              testID={`${testIDPrefix}-${option}`}
              style={[styles.segment, selected && styles.segmentSelected]}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                {selected ? '✓ ' : ''}
                {optionLabel(option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function PlaySettings({ settings, onChange }: Props) {
  return (
    <View testID="play-settings">
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        遊びの設定
      </Text>
      <Segmented
        label="自動で終わるまで"
        options={IDLE_SECONDS_OPTIONS}
        value={settings.idleSeconds}
        optionLabel={(v) => IDLE_LABELS[v]}
        onSelect={(idleSeconds) => onChange({ idleSeconds })}
        testIDPrefix="settings-idle"
      />
      <View style={[styles.group, styles.switchRow]}>
        <Text style={styles.label}>音</Text>
        <View style={styles.switchValue}>
          <Text style={styles.segmentText}>{settings.soundOn ? 'オン' : 'オフ'}</Text>
          <Switch
            value={settings.soundOn}
            onValueChange={(soundOn) => onChange({ soundOn })}
            accessibilityRole="switch"
            accessibilityLabel="音"
            accessibilityState={{ checked: settings.soundOn }}
            testID="settings-sound-switch"
          />
        </View>
      </View>
      <Segmented
        label="背景"
        options={['dark', 'light'] as const}
        value={settings.background}
        optionLabel={(v) => BACKGROUND_LABELS[v]}
        onSelect={(background) => onChange({ background })}
        testIDPrefix="settings-background"
      />
      <Segmented
        label="獲物の数"
        options={PREY_COUNT_OPTIONS}
        value={settings.preyCount}
        optionLabel={(v) => `${v}匹`}
        onSelect={(preyCount) => onChange({ preyCount })}
        testIDPrefix="settings-prey"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: fontSize.body + 2, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  group: { marginBottom: spacing.md },
  label: { fontSize: fontSize.body, color: colors.text, marginBottom: spacing.xs },
  segments: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  segment: {
    minHeight: MIN_TOUCH,
    minWidth: 64,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  segmentSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { fontSize: fontSize.body, color: colors.text },
  segmentTextSelected: { color: colors.onPrimary, fontWeight: '700' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: MIN_TOUCH },
  switchValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
