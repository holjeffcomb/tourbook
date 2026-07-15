import { useEffect } from 'react';
import { StyleSheet, TextInput, type TextStyle } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import {
  fontWeight as fontWeights,
  typography,
  type ColorToken,
  type FontWeightToken,
  type TypographyVariant,
} from '@/theme';
import { useColors } from '@/theme/ThemeProvider';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function formatNumber(n: number, decimals: number, prefix: string, suffix: string): string {
  const fixed = (Number.isFinite(n) ? n : 0).toFixed(decimals);
  const [intPart, dec] = fixed.split('.');
  const negative = intPart.startsWith('-');
  const digits = negative ? intPart.slice(1) : intPart;
  let grouped = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) grouped += ',';
    grouped += digits[i];
  }
  const body = (negative ? '-' : '') + grouped + (dec ? `.${dec}` : '');
  return `${prefix}${body}${suffix}`;
}

type Props = {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  variant?: TypographyVariant;
  color?: ColorToken;
  weight?: FontWeightToken;
  style?: TextStyle;
  /** Tween duration in ms. */
  duration?: number;
};

/**
 * A number that tweens between values instead of snapping — so counters roll
 * when the filter or year changes, preserving a sense of continuity. Built on an
 * (uneditable) TextInput because its `text` prop can be driven from the UI
 * thread via `useAnimatedProps`, avoiding a per-frame React re-render.
 */
export function AnimatedCount({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  variant = 'title',
  color = 'text',
  weight,
  style,
  duration = 700,
}: Props) {
  const colors = useColors();
  const sv = useSharedValue(value);

  useEffect(() => {
    sv.value = withTiming(value, { duration, easing: Easing.out(Easing.cubic) });
  }, [value, duration, sv]);

  // Match Text's guard: if the caller overrides fontSize (e.g. a large hero
  // number) without a matching lineHeight, the variant's fixed lineHeight would
  // clip/overlap the glyphs. Clear it so RN auto-sizes to the new fontSize.
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const clearLineHeight = flat?.fontSize != null && flat.lineHeight == null;

  const animatedProps = useAnimatedProps(() => {
    const n = sv.value;
    const fixed = (Number.isFinite(n) ? n : 0).toFixed(decimals);
    const parts = fixed.split('.');
    const negative = parts[0].startsWith('-');
    const digits = negative ? parts[0].slice(1) : parts[0];
    let grouped = '';
    for (let i = 0; i < digits.length; i += 1) {
      if (i > 0 && (digits.length - i) % 3 === 0) grouped += ',';
      grouped += digits[i];
    }
    const body = (negative ? '-' : '') + grouped + (parts[1] ? `.${parts[1]}` : '');
    return { text: `${prefix}${body}${suffix}` } as never;
  });

  return (
    <AnimatedTextInput
      editable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      accessible={false}
      defaultValue={formatNumber(value, decimals, prefix, suffix)}
      style={[
        typography[variant],
        styles.input,
        { color: colors[color] },
        weight ? { fontWeight: fontWeights[weight] } : null,
        style,
        clearLineHeight ? { lineHeight: undefined } : null,
      ]}
      animatedProps={animatedProps}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    padding: 0,
    margin: 0,
    includeFontPadding: false,
  },
});
