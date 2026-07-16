import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { MapScreenScaffold } from '@/features/maps/MapScreenScaffold';
import { TAB_BAR_HEIGHT, type MapScene } from '@/features/maps/mapScene';
import { routeColorAt } from '@/features/maps/routeColors';
import type { FriendsTourEntry } from '@/features/social/useFriendsTours';
import { useFriendsTours } from '@/features/social/useFriendsTours';
import { useUpcomingCrossedPaths } from '@/features/social/useUpcomingCrossedPaths';
import { useTourRouteLines } from '@/features/tours/useTourRouteLines';
import { dateToISO, formatDateRange } from '@/lib/date';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useThemedStyles } from '@/theme/ThemeProvider';

// A low peek by default so the map reads as the primary surface; drag up for the
// full list.
const LIST_SNAP_FRACTIONS = [0.2, 0.55, 0.92];

function friendSummary(friends: FriendsTourEntry['friends']): string {
  if (friends.length === 1) return friends[0].name;
  if (friends.length === 2) return `${friends[0].name} and ${friends[1].name}`;
  return `${friends[0].name} and ${friends.length - 1} others`;
}

function isUpcoming(entry: FriendsTourEntry, todayISO: string): boolean {
  const key = entry.endDate || entry.startDate;
  return !key || key >= todayISO;
}

function TourRow({
  entry,
  color,
  alsoOnTour,
  onPress,
}: {
  entry: FriendsTourEntry;
  color: string;
  alsoOnTour: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const dateRange = formatDateRange(entry.startDate, entry.endDate);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.accent, { backgroundColor: color }]} />
      <View style={styles.thumb}>
        {/* Placeholder until tours carry image thumbnails. */}
        <Icon name="musical-notes" size={22} color="textMuted" />
      </View>
      <View style={styles.rowBody}>
        <Text variant="subheading" numberOfLines={1}>
          {entry.actName}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {friendSummary(entry.friends)}
        </Text>
        {!!dateRange && (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {dateRange}
          </Text>
        )}
        {alsoOnTour && (
          <Text variant="caption" color="primary" numberOfLines={1}>
            You&apos;re on this too
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export function FriendsToursScreen() {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { entries, myTourIds, friendCount, isLoading, isError, refetch, isRefetching } =
    useFriendsTours();
  const crossedPaths = useUpcomingCrossedPaths();
  const bottomChrome = TAB_BAR_HEIGHT + insets.bottom;

  const todayISO = dateToISO(new Date());
  const upcoming = useMemo(
    () => entries.filter((e) => isUpcoming(e, todayISO)),
    [entries, todayISO],
  );
  const upcomingIds = useMemo(() => upcoming.map((e) => e.id), [upcoming]);
  const { routes } = useTourRouteLines(upcomingIds);

  const scene = useMemo<MapScene>(
    () => ({
      key: 'friends-tours',
      frameKey: `friends-tours-${upcomingIds.join('|')}`,
      focusMode: 'trimmed',
      routes,
      contentInsets: { top: insets.top + 56, left: spacing.md, right: spacing.md },
    }),
    [routes, upcomingIds, insets.top],
  );

  const sheetHeader = (
    <View style={styles.sheetHeader}>
      <Text variant="title">Friends&apos; Tours</Text>
      <Text variant="caption" color="textMuted">
        {upcoming.length} upcoming · tours your friends are on
      </Text>
    </View>
  );

  return (
    <MapScreenScaffold
      scene={scene}
      bottomChrome={bottomChrome}
      topInset={insets.top}
      snapFractions={LIST_SNAP_FRACTIONS}
      initialSnapIndex={0}
      sheetHeader={sheetHeader}
    >
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: spacing.xl }]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
      >
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

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <Text color="danger">Couldn&apos;t load friends&apos; tours.</Text>
            <Button title="Retry" variant="secondary" onPress={() => refetch()} />
          </View>
        ) : friendCount === 0 ? (
          <View style={styles.center}>
            <Text variant="heading">No friends yet</Text>
            <Text color="textMuted" style={styles.emptyHint}>
              Add friends to see the tours they&apos;re on.
            </Text>
            <Button title="Find people" onPress={() => router.push('/people')} />
          </View>
        ) : upcoming.length === 0 ? (
          <View style={styles.center}>
            <Text variant="heading">No upcoming tours</Text>
            <Text color="textMuted" style={styles.emptyHint}>
              When friends join tours you can see, they&apos;ll show up here.
            </Text>
          </View>
        ) : (
          upcoming.map((entry, index) => (
            <TourRow
              key={entry.id}
              entry={entry}
              color={routeColorAt(index)}
              alsoOnTour={myTourIds.has(entry.id)}
              onPress={() => router.push({ pathname: '/tours/[id]', params: { id: entry.id } })}
            />
          ))
        )}
      </ScrollView>
    </MapScreenScaffold>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    sheetHeader: {
      paddingBottom: spacing.sm,
      gap: 2,
    },
    body: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
      gap: spacing.xs,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xl,
    },
    emptyHint: {
      textAlign: 'center',
    },
    alert: {
      gap: spacing.xs,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radius.md,
      backgroundColor: colors.primaryMuted,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    accent: {
      width: 3,
      borderRadius: radius.full,
      alignSelf: 'stretch',
    },
    thumb: {
      width: 48,
      height: 48,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    rowBody: {
      flex: 1,
      gap: 1,
    },
    rowPressed: {
      opacity: 0.7,
    },
  });
