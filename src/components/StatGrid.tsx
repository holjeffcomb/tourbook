import { StyleSheet, View } from 'react-native';
import { StatTile } from '@/components/StatTile';
import { spacing } from '@/theme';

type Item = {
  label: string;
  value: string;
  detail?: string;
};

type Props = {
  items: Item[];
};

export function StatGrid({ items }: Props) {
  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <StatTile
          key={item.label}
          label={item.label}
          value={item.value}
          detail={item.detail}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
