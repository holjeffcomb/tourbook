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
import type { MyTour } from '@/features/tours/api';
import { useTours } from '@/features/tours/queries';
import { useTourRouteLines } from '@/features/tours/useTourRouteLines';
import { dateToISO, formatDateRange } from '@/lib/date';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useThemedStyles } from '@/theme/ThemeProvider';

// A low peek by default so the map reads as the primary surface; drag up for the
// full list.
const LIST_SNAP_FRACTIONS = [0.2, 0.55, 0.92];

// Upcoming = ends today or later (ongoing tours included). Tours with no dates
// are kept so a freshly-created tour still appears.
function isUpcoming(tour: Pick<MyTour, 'start_date' | 'end_date'>, todayISO: string): boolean {
  const key = tour.end_date || tour.start_date;
  return !key || key >= todayISO;
}

function TourRow({
  tour,
  color,
  onPress,
}: {
  tour: MyTour;
  color: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const dateRange = formatDateRange(tour.start_date, tour.end_date);
  const meta = [tour.myRole, dateRange].filter(Boolean).join(' · ');
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
          {tour.act.name}
        </Text>
        {!!tour.title && (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {tour.title}
          </Text>
        )}
        {!!meta && (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {meta}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export function TourListScreen() {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: tours, isLoading, isError, refetch, isRefetching } = useTours();
  const bottomChrome = TAB_BAR_HEIGHT + insets.bottom;

  const todayISO = dateToISO(new Date());
  const upcoming = useMemo(
    () => (tours ?? []).filter((t) => isUpcoming(t, todayISO)),
    [tours, todayISO],
  );
  const upcomingIds = useMemo(() => upcoming.map((t) => t.id), [upcoming]);
  const { routes } = useTourRouteLines(upcomingIds);

  const scene = useMemo<MapScene>(
    () => ({
      key: 'my-tours',
      routes,
      contentInsets: { top: insets.top + 56, left: spacing.md, right: spacing.md },
    }),
    [routes, insets.top],
  );

  const sheetHeader = (
    <View style={styles.sheetHeader}>
      <Text variant="title">My Tours</Text>
      <Text variant="caption" color="textMuted">
        {upcoming.length} upcoming tour{upcoming.length === 1 ? '' : 's'}
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
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <Text color="danger">Couldn&apos;t load your tours.</Text>
            <Button title="Retry" variant="secondary" onPress={() => refetch()} />
          </View>
        ) : upcoming.length > 0 ? (
          upcoming.map((tour, index) => (
            <TourRow
              key={tour.id}
              tour={tour}
              color={routeColorAt(index)}
              onPress={() => router.push({ pathname: '/tours/[id]', params: { id: tour.id } })}
            />
          ))
        ) : (
          <View style={styles.center}>
            <Text variant="heading">No upcoming tours</Text>
            <Text color="textMuted" style={styles.emptyHint}>
              Tap + below to add a tour.
            </Text>
          </View>
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
