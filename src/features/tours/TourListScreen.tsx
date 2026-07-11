import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useTours } from '@/features/tours/queries';
import type { MyTour } from '@/features/tours/api';
import { formatDateRange } from '@/lib/date';
import { colors, radius, spacing } from '@/theme';

function TourRow({ tour, onPress }: { tour: MyTour; onPress: () => void }) {
  const dateRange = formatDateRange(tour.start_date, tour.end_date);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Text variant="heading">{tour.act.name}</Text>
      {!!tour.title && <Text color="textMuted">{tour.title}</Text>}
      {!!tour.myRole && (
        <Text variant="caption" color="textMuted">
          {tour.myRole}
        </Text>
      )}
      {!!dateRange && (
        <Text variant="caption" color="textMuted">
          {dateRange}
        </Text>
      )}
    </Pressable>
  );
}

export function TourListScreen() {
  const router = useRouter();
  const { data: tours, isLoading, isError, refetch, isRefetching } = useTours();

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="title">Tours</Text>
        <Text variant="body" color="primary" onPress={() => router.push('/profile')}>
          Profile
        </Text>
      </View>

      <View style={styles.content}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <Text color="danger">Couldn&apos;t load your tours.</Text>
            <Button title="Retry" variant="secondary" onPress={() => refetch()} />
          </View>
        ) : tours && tours.length > 0 ? (
          <FlatList
            data={tours}
            keyExtractor={(tour) => tour.id}
            renderItem={({ item }) => (
              <TourRow
                tour={item}
                onPress={() => router.push({ pathname: '/tours/[id]', params: { id: item.id } })}
              />
            )}
            contentContainerStyle={styles.list}
            onRefresh={refetch}
            refreshing={isRefetching}
          />
        ) : (
          <View style={styles.center}>
            <Text variant="heading">No tours yet</Text>
            <Text color="textMuted" style={styles.emptyHint}>
              Add your first tour to start your logbook.
            </Text>
          </View>
        )}
      </View>

      <Button title="Add tour" onPress={() => router.push('/tours/new')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
  },
  content: {
    flex: 1,
  },
  list: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyHint: {
    textAlign: 'center',
  },
  row: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  rowPressed: {
    opacity: 0.7,
  },
});
