import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useAuth } from '@/features/auth/AuthContext';
import type { TourStop } from '@/features/shows/api';
import { TourStatsSection } from '@/features/stats/TourStatsSection';
import { TourMap, type RouteStop } from '@/features/tours/TourMap';
import { useStops } from '@/features/shows/queries';
import {
  useDeleteTour,
  useJoinTour,
  useLeaveTour,
  useMyMembership,
  useTour,
  useTourMembers,
} from '@/features/tours/queries';
import { formatDateRange, formatShowDate } from '@/lib/date';
import { colors, radius, spacing } from '@/theme';

function StopRow({
  stop,
  onPress,
  onVenuePress,
}: {
  stop: TourStop;
  onPress: () => void;
  onVenuePress?: () => void;
}) {
  const isOff = stop.kind === 'off';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, isOff && styles.offRow, pressed && styles.rowPressed]}
    >
      <View style={styles.rowHeader}>
        <Text variant="body" style={styles.rowDate}>
          {formatShowDate(stop.date)}
        </Text>
        {isOff && (
          <Text variant="caption" color="textMuted">
            Off day
          </Text>
        )}
      </View>
      {isOff ? (
        <Text color="textMuted">
          {[stop.label, stop.location?.city].filter(Boolean).join(' · ') || 'Rest / travel day'}
        </Text>
      ) : (
        <View style={styles.stopLocation}>
          {stop.venueId && onVenuePress ? (
            <Text color="primary" onPress={onVenuePress}>
              {stop.location?.name}
              {stop.location?.city ? ` · ${stop.location.city}` : ''}
            </Text>
          ) : (
            <Text color="textMuted">
              {stop.location?.name}
              {stop.location?.city ? ` · ${stop.location.city}` : ''}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

export function TourDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const tourQuery = useTour(id);
  const membershipQuery = useMyMembership(id);
  const membersQuery = useTourMembers(id);
  const stopsQuery = useStops(id);
  const deleteTour = useDeleteTour();
  const joinTour = useJoinTour(id);
  const leaveTour = useLeaveTour(id);

  const isCreator = !!tourQuery.data && tourQuery.data.created_by === session?.user.id;
  const isMember = !!membershipQuery.data;

  const routeStops: RouteStop[] = (stopsQuery.data ?? [])
    .filter((stop) => stop.location?.latitude != null && stop.location?.longitude != null)
    .map((stop) => ({
      id: stop.id,
      name: stop.location!.name,
      latitude: stop.location!.latitude as number,
      longitude: stop.location!.longitude as number,
      kind: stop.kind,
      booked: stop.location!.booked,
    }));

  const confirmLeave = () => {
    Alert.alert('Leave tour', 'You can rejoin later from the add-tour search.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveTour.mutateAsync();
          } catch (error) {
            Alert.alert('Error', error instanceof Error ? error.message : 'Unable to leave tour');
          }
        },
      },
    ]);
  };

  const confirmDelete = () => {
    Alert.alert('Delete tour', 'This removes the tour and all of its stops. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTour.mutateAsync(id);
            router.back();
          } catch (error) {
            Alert.alert('Error', error instanceof Error ? error.message : 'Unable to delete tour');
          }
        },
      },
    ]);
  };

  const tour = tourQuery.data;
  const stops = stopsQuery.data ?? [];

  const listHeader = tour ? (
    <>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text
            variant="title"
            style={styles.headerTitle}
            color="primary"
            onPress={() =>
              router.push({ pathname: '/acts/[id]', params: { id: tour.act.id } })
            }
          >
            {tour.act.name}
          </Text>
          {isCreator && (
            <View style={styles.headerActions}>
              <Text
                variant="body"
                color="primary"
                onPress={() => router.push({ pathname: '/tours/[id]/edit', params: { id } })}
              >
                Edit
              </Text>
              <Text variant="body" color="danger" onPress={confirmDelete}>
                Delete
              </Text>
            </View>
          )}
        </View>
        {!!tour.title && <Text color="textMuted">{tour.title}</Text>}
        {!!membershipQuery.data?.role && (
          <Text variant="caption" color="textMuted">
            {membershipQuery.data.role}
          </Text>
        )}
        {(() => {
          const range = formatDateRange(tour.start_date, tour.end_date);
          return range ? (
            <Text variant="caption" color="textMuted">
              {range}
            </Text>
          ) : null;
        })()}
      </View>

      <View style={styles.members}>
        <Text variant="heading">Members</Text>
        {membersQuery.data && membersQuery.data.length > 0 ? (
          membersQuery.data.map((member) => {
            const isYou = member.user_id === session?.user.id;
            const name = member.profile?.display_name || (isYou ? 'You' : 'Member');
            return (
              <Pressable
                key={member.id}
                style={styles.memberRow}
                onPress={() =>
                  router.push({ pathname: '/people/[id]', params: { id: member.user_id } })
                }
              >
                <Text variant="body" color="primary">
                  {name}
                  {isYou && name !== 'You' ? ' (you)' : ''}
                </Text>
                {!!member.role && (
                  <Text variant="caption" color="textMuted">
                    {member.role}
                  </Text>
                )}
              </Pressable>
            );
          })
        ) : (
          <Text color="textMuted">No members yet.</Text>
        )}

        {!isMember ? (
          <Button
            title="Join this tour"
            onPress={async () => {
              try {
                await joinTour.mutateAsync(undefined);
              } catch (error) {
                Alert.alert(
                  'Error',
                  error instanceof Error ? error.message : 'Unable to join tour',
                );
              }
            }}
            loading={joinTour.isPending}
          />
        ) : (
          !isCreator && <Button title="Leave tour" variant="secondary" onPress={confirmLeave} />
        )}
      </View>

      <TourMap stops={routeStops} />

      {stops.length > 0 && <TourStatsSection stops={stops} />}

      <Text variant="heading" style={styles.itineraryHeading}>
        Itinerary
      </Text>
    </>
  ) : null;

  const listFooter =
    isMember && tour ? (
      <View style={styles.actions}>
        <Button
          title="Add show"
          onPress={() => router.push({ pathname: '/tours/[id]/add-show', params: { id } })}
          style={styles.actionButton}
        />
        <Button
          title="Add off day"
          variant="secondary"
          onPress={() => router.push({ pathname: '/tours/[id]/add-off-day', params: { id } })}
          style={styles.actionButton}
        />
      </View>
    ) : null;

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
        <FlatList
          style={styles.flex}
          data={stops}
          keyExtractor={(stop) => stop.id}
          renderItem={({ item }) => (
            <StopRow
              stop={item}
              onPress={() =>
                router.push({
                  pathname: '/tours/[id]/shows/[showId]',
                  params: { id, showId: item.id },
                })
              }
              onVenuePress={
                item.venueId
                  ? () =>
                      router.push({
                        pathname: '/venues/[id]',
                        params: { id: item.venueId as string },
                      })
                  : undefined
              }
            />
          )}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          ListEmptyComponent={
            stopsQuery.isLoading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : stopsQuery.isError ? (
              <View style={styles.emptyState}>
                <Text color="danger">Couldn&apos;t load the itinerary.</Text>
                <Button title="Retry" variant="secondary" onPress={() => stopsQuery.refetch()} />
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text color="textMuted" style={styles.emptyHint}>
                  Nothing scheduled yet.
                </Text>
              </View>
            )
          }
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onRefresh={stopsQuery.refetch}
          refreshing={stopsQuery.isRefetching}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    paddingTop: spacing.md,
  },
  header: {
    gap: spacing.xs,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerTitle: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  members: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  itineraryHeading: {
    paddingTop: spacing.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  emptyHint: {
    textAlign: 'center',
  },
  list: {
    paddingBottom: spacing.xl,
  },
  separator: {
    height: spacing.sm,
  },
  row: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  offRow: {
    backgroundColor: colors.background,
    borderStyle: 'dashed',
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowDate: {
    fontWeight: '600',
  },
  stopLocation: {
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
});
