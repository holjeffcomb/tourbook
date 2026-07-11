import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import type { ShowWithVenue } from '@/features/shows/api';
import { useShows } from '@/features/shows/queries';
import { useTour } from '@/features/tours/queries';
import { formatShowDate } from '@/lib/date';
import { colors, radius, spacing } from '@/theme';

function ShowRow({ show }: { show: ShowWithVenue }) {
  return (
    <View style={styles.row}>
      <Text variant="body" style={styles.rowDate}>
        {formatShowDate(show.date)}
      </Text>
      <Text color="textMuted">
        {show.venue.name} · {show.venue.city}
      </Text>
    </View>
  );
}

export function TourDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tourQuery = useTour(id);
  const showsQuery = useShows(id);

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text variant="body" color="primary" onPress={() => router.back()}>
          ‹ Tours
        </Text>
      </View>

      {tourQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : tourQuery.isError || !tourQuery.data ? (
        <View style={styles.center}>
          <Text color="danger">Couldn&apos;t load this tour.</Text>
          <Button title="Retry" variant="secondary" onPress={() => tourQuery.refetch()} />
        </View>
      ) : (
        <>
          <View style={styles.header}>
            <Text variant="title">{tourQuery.data.act.name}</Text>
            {!!tourQuery.data.title && <Text color="textMuted">{tourQuery.data.title}</Text>}
            {!!tourQuery.data.role && (
              <Text variant="caption" color="textMuted">
                {tourQuery.data.role}
              </Text>
            )}
          </View>

          <View style={styles.content}>
            <Text variant="heading">Shows</Text>
            {showsQuery.isLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : showsQuery.isError ? (
              <View style={styles.center}>
                <Text color="danger">Couldn&apos;t load shows.</Text>
                <Button title="Retry" variant="secondary" onPress={() => showsQuery.refetch()} />
              </View>
            ) : showsQuery.data && showsQuery.data.length > 0 ? (
              <FlatList
                data={showsQuery.data}
                keyExtractor={(show) => show.id}
                renderItem={({ item }) => <ShowRow show={item} />}
                contentContainerStyle={styles.list}
                onRefresh={showsQuery.refetch}
                refreshing={showsQuery.isRefetching}
              />
            ) : (
              <View style={styles.center}>
                <Text color="textMuted" style={styles.emptyHint}>
                  No shows logged yet.
                </Text>
              </View>
            )}
          </View>

          <Button
            title="Add show"
            onPress={() => router.push({ pathname: '/tours/[id]/add-show', params: { id } })}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    paddingTop: spacing.md,
  },
  header: {
    gap: spacing.xs,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  content: {
    flex: 1,
    gap: spacing.sm,
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
  list: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  row: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  rowDate: {
    fontWeight: '600',
  },
});
