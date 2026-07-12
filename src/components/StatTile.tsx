import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { colors, spacing } from '@/theme';

type Props = {
  label: string;
  value: string;
  detail?: string;
};

export function StatTile({ label, value, detail }: Props) {
  return (
    <View style={styles.tile}>
      <Text variant="title" style={styles.value}>
        {value}
      </Text>
      <Text variant="caption" color="textMuted">
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

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: '45%',
    gap: 2,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  value: {
    fontSize: 24,
  },
});
