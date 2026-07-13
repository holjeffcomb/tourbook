import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useUpcomingCrossedPaths } from '@/features/social/useUpcomingCrossedPaths';
import { useTours } from '@/features/tours/queries';
import type { MyTour } from '@/features/tours/api';
import { formatDateRange } from '@/lib/date';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useThemedStyles } from '@/theme/ThemeProvider';

function TourRow({ tour, onPress }: { tour: MyTour; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
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
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const router = useRouter();
  const { data: tours, isLoading, isError, refetch, isRefetching } = useTours();
  const crossedPaths = useUpcomingCrossedPaths();

  return (
    <Screen>
      <AppHeader title="My Tours" />

      {crossedPaths.count > 0 && (
        <Pressable
          onPress={() => router.push('/people/crossed-paths')}
          style={({ pressed }) => [styles.alert, pressed && styles.rowPressed]}
        >
          <Text variant="body" color="primary">
            {crossedPaths.count === 1
              ? '1 upcoming crossed path with a friend'
              : `${crossedPaths.count} upcoming crossed paths with friends`}
          </Text>
          <Text variant="caption" color="textMuted">
            Tap to see who you&apos;ll be near
          </Text>
        </Pressable>
      )}

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
              Tap + below to add your first tour.
            </Text>
          </View>
        )}
      </View>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  alert: {
    marginTop: spacing.md,
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
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
