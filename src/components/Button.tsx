import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
} from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { Text } from '@/components/Text';
import { radius, spacing, type ColorToken, type ThemeColors } from '@/theme';
import { useColors } from '@/theme/ThemeProvider';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

type Props = Omit<PressableProps, 'children'> & {
  title: string;
  loading?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: IconName;
  rightIcon?: IconName;
  fullWidth?: boolean;
};

const SIZES: Record<ButtonSize, { height: number; paddingHorizontal: number; fontVariant: 'callout' | 'body' }> = {
  sm: { height: 36, paddingHorizontal: spacing.md, fontVariant: 'callout' },
  md: { height: 48, paddingHorizontal: spacing.lg, fontVariant: 'body' },
  lg: { height: 56, paddingHorizontal: spacing.lg, fontVariant: 'body' },
};

function variantColors(variant: ButtonVariant, colors: ThemeColors) {
  switch (variant) {
    case 'primary':
      return { bg: colors.primary, border: colors.primary, fg: 'onPrimary' as ColorToken };
    case 'danger':
      return { bg: colors.danger, border: colors.danger, fg: 'textInverse' as ColorToken };
    case 'ghost':
      return { bg: 'transparent', border: 'transparent', fg: 'primary' as ColorToken };
    case 'secondary':
    default:
      return { bg: colors.surface, border: colors.border, fg: 'text' as ColorToken };
  }
}

export function Button({
  title,
  loading = false,
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  fullWidth = true,
  disabled,
  style,
  ...rest
}: Props) {
  const colors = useColors();
  const isDisabled = disabled || loading;
  const sizing = SIZES[size];
  const v = useMemo(() => variantColors(variant, colors), [variant, colors]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        {
          height: sizing.height,
          paddingHorizontal: sizing.paddingHorizontal,
          backgroundColor: v.bg,
          borderColor: v.border,
          borderWidth: variant === 'ghost' ? 0 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        isDisabled && styles.disabled,
        state.pressed && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={colors[v.fg]} />
      ) : (
        <View style={styles.content}>
          {leftIcon && <Icon name={leftIcon} size={18} color={v.fg} />}
          <Text variant={sizing.fontVariant} color={v.fg} weight="semibold">
            {title}
          </Text>
          {rightIcon && <Icon name={rightIcon} size={18} color={v.fg} />}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
});
