import { View, type ViewStyle } from 'react-native';
import { elevation as elevations, radius, spacing, type ElevationToken } from '@/theme';
import { useColors } from '@/theme/ThemeProvider';

export type CardVariant = 'outlined' | 'elevated' | 'filled';

type Props = {
  children: React.ReactNode;
  variant?: CardVariant;
  elevation?: ElevationToken;
  style?: ViewStyle;
};

export function Card({ children, variant = 'outlined', elevation, style }: Props) {
  const colors = useColors();

  const variantStyle: ViewStyle =
    variant === 'elevated'
      ? { backgroundColor: colors.surfaceElevated, borderWidth: 0, ...elevations[elevation ?? 'md'] }
      : variant === 'filled'
        ? { backgroundColor: colors.surfaceMuted, borderWidth: 0 }
        : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border };

  return (
    <View
      style={[
        {
          gap: spacing.sm,
          padding: spacing.md,
          borderRadius: radius.md,
        },
        variantStyle,
        elevation && variant !== 'elevated' ? elevations[elevation] : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}
