import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { MapScreenScaffold } from '@/features/maps/MapScreenScaffold';
import { TAB_BAR_HEIGHT, type MapScene } from '@/features/maps/mapScene';
import { routeColorAt } from '@/features/maps/routeColors';
import type { MyTour } from '@/features/tours/api';
import { useActiveTour, useTours } from '@/features/tours/queries';
import { TourModeScreen } from '@/features/tours/TourModeScreen';
import { useTourRouteLines } from '@/features/tours/useTourRouteLines';
import { dateToISO, formatDateRange } from '@/lib/date';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useThemedStyles } from '@/theme/ThemeProvider';

// A low peek by default so the map reads as the primary surface; drag up for the
// full list.
const LIST_SNAP_FRACTIONS = [0.2, 0.55, 0.92];

type MapFocusMode = 'next' | 'all';

// Upcoming = ends today or later (ongoing tours included). Tours with no dates
// are kept so a freshly-created tour still appears.
function isUpcoming(tour: Pick<MyTour, 'start_date' | 'end_date'>, todayISO: string): boolean {
  const key = tour.end_date || tour.start_date;
  return !key || key >= todayISO;
}

/** Chronological key — soonest start first; undated tours sink to the end. */
function tourSortKey(tour: Pick<MyTour, 'start_date' | 'end_date'>): string {
  return tour.start_date || tour.end_date || '9999-12-31';
}

function TourRow({
  tour,
  color,
  onPress,
  featured = false,
}: {
  tour: MyTour;
  color: string;
  onPress: () => void;
  featured?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const dateRange = formatDateRange(tour.start_date, tour.end_date);
  const meta = [tour.myRole, dateRange].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        featured && styles.rowFeatured,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={[styles.accent, { backgroundColor: color }]} />
      <View style={[styles.thumb, featured && styles.thumbFeatured]}>
        {/* Placeholder until tours carry image thumbnails. */}
        <Icon name="map" size={featured ? 26 : 22} color="textMuted" />
      </View>
      <View style={styles.rowBody}>
        <Text variant={featured ? 'heading' : 'subheading'} numberOfLines={1}>
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

function FocusToggle({
  mode,
  onChange,
  allCount,
}: {
  mode: MapFocusMode;
  onChange: (mode: MapFocusMode) => void;
  allCount: number;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      <Pressable
        onPress={() => onChange('next')}
        accessibilityRole="tab"
        accessibilityState={{ selected: mode === 'next' }}
        style={[styles.segmentBtn, mode === 'next' && styles.segmentBtnActive]}
      >
        <Text
          variant="caption"
          weight="semibold"
          color={mode === 'next' ? 'onPrimary' : 'textSecondary'}
        >
          Next tour
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange('all')}
        accessibilityRole="tab"
        accessibilityState={{ selected: mode === 'all' }}
        style={[styles.segmentBtn, mode === 'all' && styles.segmentBtnActive]}
      >
        <Text
          variant="caption"
          weight="semibold"
          color={mode === 'all' ? 'onPrimary' : 'textSecondary'}
        >
          All tours{allCount > 0 ? ` (${allCount})` : ''}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * The "My Tours" tab. When the current date falls inside one of the user's
 * tours the app enters Tour Mode (focused on where they are vs. the venue);
 * otherwise it shows the upcoming-tours overview list. The switch is automatic
 * and date-driven, but the user can drop back to the list at any time (and jump
 * straight back into the current tour from there).
 */
export function TourListScreen() {
  const { activeTour, todayISO } = useActiveTour();
  const [showList, setShowList] = useState(false);

  if (activeTour && !showList) {
    return (
      <TourModeScreen
        tour={activeTour}
        todayISO={todayISO}
        onViewList={() => setShowList(true)}
      />
    );
  }
  return <UpcomingToursScreen activeTour={activeTour} onResumeTour={() => setShowList(false)} />;
}

function UpcomingToursScreen({
  activeTour,
  onResumeTour,
}: {
  activeTour: MyTour | null;
  onResumeTour: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: tours, isLoading, isError, refetch, isRefetching } = useTours();
  const bottomChrome = TAB_BAR_HEIGHT + insets.bottom;
  const [focusMode, setFocusMode] = useState<MapFocusMode>('next');

  const todayISO = dateToISO(new Date());
  const upcoming = useMemo(() => {
    return (tours ?? [])
      .filter((t) => isUpcoming(t, todayISO))
      .sort((a, b) => {
        const byDate = tourSortKey(a).localeCompare(tourSortKey(b));
        if (byDate !== 0) return byDate;
        return a.created_at < b.created_at ? 1 : -1;
      });
  }, [tours, todayISO]);

  // The active tour is surfaced separately as "Current tour", so keep it out of
  // the plain upcoming list to avoid showing it twice.
  const activeId = activeTour?.id ?? null;
  const others = useMemo(() => upcoming.filter((t) => t.id !== activeId), [upcoming, activeId]);
  const nextTour = others[0] ?? null;
  const rest = others.slice(1);
  // What the "Next tour" map focus should frame — falls back to the current tour
  // when there's nothing else upcoming.
  const focusTour = nextTour ?? activeTour;
  const upcomingIds = useMemo(() => upcoming.map((t) => t.id), [upcoming]);
  const colorIndex = useMemo(() => new Map(upcomingIds.map((id, i) => [id, i])), [upcomingIds]);

  const { routes: allRoutes } = useTourRouteLines(upcomingIds);
  const routes = useMemo(() => {
    if (focusMode === 'next' && focusTour) {
      return allRoutes.filter((r) => r.id === focusTour.id);
    }
    return allRoutes;
  }, [allRoutes, focusMode, focusTour]);

  const scene = useMemo<MapScene>(() => {
    const focusIds =
      focusMode === 'next' && focusTour ? [focusTour.id] : upcomingIds;
    return {
      key: 'my-tours',
      frameKey: `my-tours-${focusMode}-${focusIds.join('|')}`,
      // Single tour: fit the whole route. All tours: trimmed overview so a
      // cross-ocean outlier doesn't zoom the world.
      focusMode: focusMode === 'next' ? 'bounds' : 'trimmed',
      routes,
      contentInsets: { top: insets.top + 56, left: spacing.md, right: spacing.md },
    };
  }, [routes, focusMode, focusTour, upcomingIds, insets.top]);

  const sheetHeader = (
    <View style={styles.sheetHeader}>
      <View style={styles.sheetTitleRow}>
        <Text variant="title">My Tours</Text>
        <Text variant="caption" color="textMuted">
          {upcoming.length} upcoming
        </Text>
      </View>
      {upcoming.length > 1 && (
        <FocusToggle mode={focusMode} onChange={setFocusMode} allCount={upcoming.length} />
      )}
    </View>
  );

  const openTour = (id: string) =>
    router.push({ pathname: '/tours/[id]', params: { id } });

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
        ) : activeTour || nextTour ? (
          <>
            {activeTour && (
              <View style={styles.section}>
                <View style={styles.currentKickerRow}>
                  <View style={styles.currentDot} />
                  <Text style={styles.currentKicker}>Current tour</Text>
                </View>
                <TourRow
                  tour={activeTour}
                  color={routeColorAt(colorIndex.get(activeTour.id) ?? 0)}
                  featured
                  onPress={onResumeTour}
                />
                <Text variant="caption" color="textMuted" style={styles.resumeHint}>
                  You&apos;re on this tour now — tap to reopen Tour Mode.
                </Text>
              </View>
            )}

            {nextTour && (
              <View style={styles.section}>
                <Text style={styles.sectionKicker}>{activeTour ? 'Next tour' : 'Upcoming tour'}</Text>
                <TourRow
                  tour={nextTour}
                  color={routeColorAt(colorIndex.get(nextTour.id) ?? 0)}
                  featured
                  onPress={() => openTour(nextTour.id)}
                />
              </View>
            )}

            {focusMode === 'all' && rest.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionKicker}>More upcoming</Text>
                {rest.map((tour) => (
                  <TourRow
                    key={tour.id}
                    tour={tour}
                    color={routeColorAt(colorIndex.get(tour.id) ?? 0)}
                    onPress={() => openTour(tour.id)}
                  />
                ))}
              </View>
            )}

            {focusMode === 'next' && rest.length > 0 && (
              <Pressable
                onPress={() => setFocusMode('all')}
                accessibilityRole="button"
                style={({ pressed }) => [styles.showAllHint, pressed && styles.rowPressed]}
              >
                <Text variant="callout" color="primary">
                  Show all {others.length} upcoming tours
                </Text>
                <Icon name="chevron-forward" size={16} color="primary" />
              </Pressable>
            )}
          </>
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
      gap: spacing.sm,
    },
    sheetTitleRow: {
      gap: 2,
    },
    segment: {
      flexDirection: 'row',
      padding: 3,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceMuted,
      gap: 2,
    },
    segmentBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.xs + 1,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.full,
    },
    segmentBtnActive: {
      backgroundColor: colors.primary,
    },
    body: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
      gap: spacing.md,
    },
    section: {
      gap: spacing.xs,
    },
    sectionKicker: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.textMuted,
      marginBottom: 2,
    },
    currentKickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginBottom: 2,
    },
    currentDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.success,
    },
    currentKicker: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.success,
    },
    resumeHint: {
      marginTop: 2,
    },
    showAllHint: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xxs,
      paddingVertical: spacing.sm,
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
    rowFeatured: {
      backgroundColor: colors.surfaceElevated,
      borderColor: colors.borderStrong,
      paddingVertical: spacing.md,
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
    thumbFeatured: {
      width: 56,
      height: 56,
    },
    rowBody: {
      flex: 1,
      gap: 1,
    },
    rowPressed: {
      opacity: 0.7,
    },
  });
