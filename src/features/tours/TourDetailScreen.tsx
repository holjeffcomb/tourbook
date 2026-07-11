import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useAuth } from '@/features/auth/AuthContext';
import type { ShowWithVenue } from '@/features/shows/api';
import { useShows } from '@/features/shows/queries';
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

function ShowRow({ show, onPress }: { show: ShowWithVenue; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Text variant="body" style={styles.rowDate}>
        {formatShowDate(show.date)}
      </Text>
      <Text color="textMuted">
        {show.venue.name} · {show.venue.city}
      </Text>
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
  const showsQuery = useShows(id);
  const deleteTour = useDeleteTour();
  const joinTour = useJoinTour(id);
  const leaveTour = useLeaveTour(id);

  const isCreator = !!tourQuery.data && tourQuery.data.created_by === session?.user.id;
  const isMember = !!membershipQuery.data;

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
    Alert.alert('Delete tour', 'This removes the tour and all of its shows. This cannot be undone.', [
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
            <View style={styles.headerTop}>
              <Text variant="title" style={styles.headerTitle}>
                {tourQuery.data.act.name}
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
            {!!tourQuery.data.title && <Text color="textMuted">{tourQuery.data.title}</Text>}
            {!!membershipQuery.data?.role && (
              <Text variant="caption" color="textMuted">
                {membershipQuery.data.role}
              </Text>
            )}
            {(() => {
              const range = formatDateRange(tourQuery.data.start_date, tourQuery.data.end_date);
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
                  <View key={member.id} style={styles.memberRow}>
                    <Text variant="body">
                      {name}
                      {isYou && name !== 'You' ? ' (you)' : ''}
                    </Text>
                    {!!member.role && (
                      <Text variant="caption" color="textMuted">
                        {member.role}
                      </Text>
                    )}
                  </View>
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
                renderItem={({ item }) => (
                  <ShowRow
                    show={item}
                    onPress={() =>
                      router.push({
                        pathname: '/tours/[id]/shows/[showId]',
                        params: { id, showId: item.id },
                      })
                    }
                  />
                )}
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

          {isMember && (
            <Button
              title="Add show"
              onPress={() => router.push({ pathname: '/tours/[id]/add-show', params: { id } })}
            />
          )}
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
  rowPressed: {
    opacity: 0.7,
  },
  rowDate: {
    fontWeight: '600',
  },
});
