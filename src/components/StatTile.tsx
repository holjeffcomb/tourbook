import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

type Props = {
  label: string;
  value: string;
  detail?: string;
};

export function StatTile({ label, value, detail }: Props) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.tile}>
      <Text variant="heading" style={styles.value}>
        {value}
      </Text>
      <Text variant="label" color="textMuted">
        {label}
      </Text>
      {!!detail && (
        <Text variant="caption" color="textMuted" numberOfLines={2}>
          {detail}
        </Text>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    tile: {
      flex: 1,
      minWidth: '45%',
      gap: 2,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm + 2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    value: {
      fontSize: 20,
      letterSpacing: -0.3,
    },
  });
