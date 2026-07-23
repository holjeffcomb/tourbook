import { useMemo } from 'react';
import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { MIN_TOUCH_TARGET, radius, type ColorToken, type ThemeColors } from '@/theme';
import { useColors } from '@/theme/ThemeProvider';

export type IconButtonVariant = 'plain' | 'tinted' | 'filled';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  name: IconName;
  /** Required so icon-only controls are announced by screen readers. */
  accessibilityLabel: string;
  /** Glyph size (px). The touch target stays >= MIN_TOUCH_TARGET regardless. */
  size?: number;
  /** Icon color token/hex. Ignored for `filled` (always onPrimary). */
  color?: ColorToken | (string & {});
  variant?: IconButtonVariant;
  /**
   * Visible background diameter for `tinted`/`filled` (px). The *touch* area is
   * always at least MIN_TOUCH_TARGET even when the chip is smaller.
   */
  containerSize?: number;
  style?: PressableProps['style'];
};

/**
 * A single icon-only control with a guaranteed comfortable touch target.
 *
 * The visible glyph (and optional chip background) can be small, but the
 * pressable footprint is always >= MIN_TOUCH_TARGET so it's easy to tap on a
 * phone. Prefer this over hand-rolled icon `Pressable`s.
 */
export function IconButton({
  name,
  accessibilityLabel,
  size = 22,
  color,
  variant = 'plain',
  containerSize = 32,
  disabled,
  style,
  ...rest
}: Props) {
  const colors = useColors();
  const v = useMemo(() => variantColors(variant, color, colors), [variant, color, colors]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={8}
      style={(state) => [
        styles.base,
        disabled && styles.disabled,
        state.pressed && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      <View
        style={[
          styles.chip,
          { width: containerSize, height: containerSize },
          v.bg ? { backgroundColor: v.bg } : null,
        ]}
      >
        <Icon name={name} size={size} color={v.fg} />
      </View>
    </Pressable>
  );
}

function variantColors(
  variant: IconButtonVariant,
  color: Props['color'],
  colors: ThemeColors,
): { bg: string | null; fg: ColorToken | (string & {}) } {
  switch (variant) {
    case 'filled':
      return { bg: colors.primary, fg: 'onPrimary' };
    case 'tinted':
      return { bg: colors.primaryMuted, fg: color ?? 'primary' };
    case 'plain':
    default:
      return { bg: null, fg: color ?? 'text' };
  }
}

const styles = StyleSheet.create({
  base: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.6,
  },
});
