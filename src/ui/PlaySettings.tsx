/**
 * 遊びの設定（interaction-spec.md の PlaySettings。FR2.6, FR4.2。v0.1 で獲物の数 FR5.1 を足し、範囲の変更（2026-11-07）で種類ごとの数にした）。
 * 変えた時点で保存し、次の遊びから使う。
 */
import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import {
  canChangePreyCount,
  changePreyCount,
  IDLE_SECONDS_OPTIONS,
  PREY_COUNT,
  PREY_COUNT_PRESETS,
  samePreyCounts,
  totalPrey,
  type Background,
  type IdleSeconds,
  type PlaySettings as Settings,
  type PreyCounts,
} from '../data/settingsStore';
import { PREY_KINDS } from '../prey/kinds';
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

type StepButtonProps = { sign: '−' | '＋'; label: string; enabled: boolean; disabledHint: string; onPress: () => void; testID: string };

function StepButton({ sign, label, enabled, disabledHint, onPress, testID }: StepButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={enabled ? undefined : disabledHint}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      testID={testID}
      style={[styles.stepButton, !enabled && styles.stepButtonDisabled]}
    >
      <Text style={[styles.stepText, !enabled && styles.stepTextDisabled]}>{sign}</Text>
    </Pressable>
  );
}

/**
 * 獲物の種類ごとの数（FR5.1・FR5.2）。種類ごとに 0 匹から選べ、合計は 1〜50 匹。
 * 合計が上限のときは「＋」、0 匹か合計が下限のときは「−」を押せない。試験に使う組み合わせはまとめて選べる。
 */
function PreyCountsPicker({ counts, onSelect }: { counts: PreyCounts; onSelect: (counts: PreyCounts) => void }) {
  const total = totalPrey(counts);
  return (
    <View style={styles.group} testID="settings-prey-group">
      <Text style={styles.label} testID="settings-prey-total" accessibilityLiveRegion="polite">
        獲物の数（合計 {total}匹、{PREY_COUNT.totalMax}匹まで）
      </Text>
      <View style={styles.segments} accessibilityRole="radiogroup" accessibilityLabel="獲物の数をまとめて選ぶ">
        {PREY_COUNT_PRESETS.map((preset) => {
          const selected = samePreyCounts(counts, preset.counts);
          return (
            <Pressable
              key={preset.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`獲物の数 ${preset.label}`}
              onPress={() => onSelect(preset.counts)}
              testID={`settings-prey-preset-${preset.id}`}
              style={[styles.segment, selected && styles.segmentSelected]}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                {selected ? '✓ ' : ''}
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {PREY_KINDS.map(({ id, label }) => {
        const n = counts[id] ?? 0;
        return (
          <View key={id} style={styles.kindRow} testID={`settings-prey-${id}`}>
            <Text style={styles.kindLabel}>{label}</Text>
            <View style={styles.stepper}>
              <StepButton
                sign="−"
                label={`${label}を1匹減らす`}
                enabled={canChangePreyCount(counts, id, -1)}
                disabledHint={n <= PREY_COUNT.perKindMin ? `${label}は0匹です` : `合計は${PREY_COUNT.totalMin}匹より少なくできません`}
                onPress={() => onSelect(changePreyCount(counts, id, -1))}
                testID={`settings-prey-${id}-minus`}
              />
              <Text style={styles.kindCount} accessibilityLabel={`${label} ${n}匹`} testID={`settings-prey-${id}-count`}>
                {n}匹
              </Text>
              <StepButton
                sign="＋"
                label={`${label}を1匹増やす`}
                enabled={canChangePreyCount(counts, id, 1)}
                disabledHint={`合計は${PREY_COUNT.totalMax}匹までです`}
                onPress={() => onSelect(changePreyCount(counts, id, 1))}
                testID={`settings-prey-${id}-plus`}
              />
            </View>
          </View>
        );
      })}
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
      <PreyCountsPicker counts={settings.preyCounts} onSelect={(preyCounts) => onChange({ preyCounts })} />
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
  kindRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: MIN_TOUCH, marginTop: spacing.xs },
  kindLabel: { fontSize: fontSize.body, color: colors.text },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepButton: {
    minHeight: MIN_TOUCH,
    minWidth: MIN_TOUCH,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  stepButtonDisabled: { opacity: 0.4 },
  stepText: { fontSize: fontSize.body + 4, color: colors.text, fontWeight: '700' },
  stepTextDisabled: { color: colors.text },
  kindCount: { minWidth: 56, textAlign: 'center', fontSize: fontSize.body, color: colors.text },
});
