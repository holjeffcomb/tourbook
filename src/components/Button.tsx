import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';
import { Text } from '@/components/Text';
import { colors, radius, spacing } from '@/theme';

type Props = Omit<PressableProps, 'children'> & {
  title: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
};

export function Button({ title, loading = false, variant = 'primary', disabled, style, ...rest }: Props) {
  const isDisabled = disabled || loading;
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        isDisabled && styles.disabled,
        state.pressed && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.background : colors.text} />
      ) : (
        <Text variant="body" color={isPrimary ? 'background' : 'text'} style={styles.label}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    fontWeight: '600',
  },
});
