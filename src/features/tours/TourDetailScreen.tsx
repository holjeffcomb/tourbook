import { BlurView } from 'expo-blur';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useAuth } from '@/features/auth/AuthContext';
import { MapScreenScaffold } from '@/features/maps/MapScreenScaffold';
import { type Coord, type MapScene, type SceneLineGroup } from '@/features/maps/mapScene';
import type { TourStop } from '@/features/shows/api';
import { TourStatsSection } from '@/features/stats/TourStatsSection';
import { useStops } from '@/features/shows/queries';
import {
  useDeleteTour,
  useJoinTour,
  useLeaveTour,
  useMyMembership,
  useTour,
  useTourMembers,
} from '@/features/tours/queries';
import { useVenue, useVenuePlayers } from '@/features/venues/queries';
import { formatDateRange, formatShowDate } from '@/lib/date';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useTheme, useThemedStyles } from '@/theme/ThemeProvider';

// Mid "neighbourhood" zoom used when a single stop is selected on the map — high
// enough to place the stop in its surroundings, but not full venue detail.
const STOP_FOCUS_ZOOM = 11;

function StopRow({
  stop,
  onPress,
  onVenuePress,
}: {
  stop: TourStop;
  onPress: () => void;
  onVenuePress?: () => void;
}) {
  const styles = useThemedStyles(createStyles);
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

type LocatedStop = {
  id: string;
  coordinate: Coord;
  kind: TourStop['kind'];
  booked: boolean;
};

/**
 * Floating detail card shown when a numbered stop is tapped on the map. Booked
 * stops fetch the venue's address (list stops don't carry it) and how many times
 * the current user has played there, and link through to the venue screen.
 *
 * There's no venue photo yet: Mapbox's Search/Geocoding APIs don't return place
 * photos, so a thumbnail would need a different source (e.g. Google Places
 * Photos) or user uploads. The layout leaves room to add one later.
 */
function VenueStopCard({
  stop,
  showNumber,
  currentUserId,
  topInset,
  onClose,
  onPrev,
  onNext,
  onOpenVenue,
}: {
  stop: TourStop;
  showNumber: number | null;
  currentUserId: string | null;
  topInset: number;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onOpenVenue?: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { scheme } = useTheme();
  const venueQuery = useVenue(stop.venueId ?? '');
  const playersQuery = useVenuePlayers(stop.venueId ?? '');

  const isOff = stop.kind === 'off';
  const booked = stop.location?.booked ?? false;
  const name = stop.location?.name || (isOff ? 'Off day' : 'Venue TBD');
  const city = stop.location?.city || venueQuery.data?.city || '';
  const address = venueQuery.data?.address ?? stop.location?.address ?? null;
  const visits = currentUserId
    ? (playersQuery.data?.find((p) => p.userId === currentUserId)?.showCount ?? null)
    : null;

  const kicker = isOff ? 'OFF DAY' : showNumber != null ? `SHOW ${showNumber}` : 'SHOW';
  const meta = [formatShowDate(stop.date), visits != null && visits > 0 ? `Visited ${visits}×` : null]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(120)}
      style={[styles.venueCard, { top: topInset + 52 }]}
    >
      <BlurView
        intensity={scheme === 'dark' ? 40 : 60}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.venueCardTint} pointerEvents="none" />
      <View style={styles.venueCardHeader}>
        <Text style={styles.venueKicker}>
          {kicker}
          {!isOff && !booked ? '  ·  TBD' : ''}
        </Text>
        <View style={styles.venueCardNav}>
          <Pressable
            onPress={onPrev}
            disabled={!onPrev}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Previous stop"
            style={styles.navButton}
          >
            <Text variant="body" style={[styles.navArrow, !onPrev && styles.navArrowDisabled]}>
              ‹
            </Text>
          </Pressable>
          <Pressable
            onPress={onNext}
            disabled={!onNext}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Next stop"
            style={styles.navButton}
          >
            <Text variant="body" style={[styles.navArrow, !onNext && styles.navArrowDisabled]}>
              ›
            </Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close stop details"
            style={styles.navButton}
          >
            <Text variant="body" color="textMuted">
              ✕
            </Text>
          </Pressable>
        </View>
      </View>
      <Text variant="heading" numberOfLines={1}>
        {name}
      </Text>
      {!!city && city !== name && (
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {city}
        </Text>
      )}
      {!!address && (
        <Text variant="caption" color="textMuted" numberOfLines={2}>
          {address}
        </Text>
      )}
      {!!meta && (
        <Text variant="caption" color="textMuted" style={styles.venueCardMeta}>
          {meta}
        </Text>
      )}
      {onOpenVenue && (
        <Pressable
          onPress={onOpenVenue}
          accessibilityRole="button"
          style={styles.venueCardLink}
          hitSlop={6}
        >
          <Text variant="body" color="primary" weight="semibold">
            View venue details ›
          </Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

export function TourDetailScreen() {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const insets = useSafeAreaInsets();
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
  const tour = tourQuery.data;
  const stops = stopsQuery.data ?? [];

  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const onSelectStop = useCallback((stopId: string) => setSelectedStopId(stopId), []);

  // Show numbers are 1-based across booked/TBD stops (off days don't count),
  // matching the numbers drawn on the map markers.
  const showNumberById = useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const s of stops) {
      if (s.kind !== 'off') {
        n += 1;
        map.set(s.id, n);
      }
    }
    return map;
  }, [stops]);

  const selectedStop = selectedStopId
    ? (stops.find((s) => s.id === selectedStopId) ?? null)
    : null;

  const located = useMemo<LocatedStop[]>(
    () =>
      stops
        .filter((s) => s.location?.latitude != null && s.location?.longitude != null)
        .map((s) => ({
          id: s.id,
          coordinate: [s.location!.longitude as number, s.location!.latitude as number],
          kind: s.kind,
          booked: s.location!.booked,
        })),
    [stops],
  );

  // Markers + route lines only depend on the stops, not on the current
  // selection — keeping them in their own memo means selecting a stop reframes
  // the camera without re-rendering every marker.
  const mapContent = useMemo(() => {
    if (located.length === 0) return null;
    let showNumber = 0;
    const markers = located.map((s) => {
      if (s.kind !== 'off') showNumber += 1;
      const kind = s.kind === 'off' ? ('off' as const) : s.booked ? ('show' as const) : ('tbd' as const);
      return {
        id: s.id,
        coordinate: s.coordinate,
        kind,
        label: s.kind === 'off' ? undefined : String(showNumber),
      };
    });

    const solid: Coord[][] = [];
    const dashed: Coord[][] = [];
    for (let i = 0; i < located.length - 1; i += 1) {
      const seg: Coord[] = [located[i].coordinate, located[i + 1].coordinate];
      if (located[i].kind === 'off' || located[i + 1].kind === 'off') dashed.push(seg);
      else solid.push(seg);
    }
    const lines: SceneLineGroup[] = [];
    if (solid.length > 0) lines.push({ id: 'solid', segments: solid, style: 'solid', color: 'primary' });
    if (dashed.length > 0)
      lines.push({ id: 'dashed', segments: dashed, style: 'dashed', color: 'textMuted' });

    return { markers, lines, focus: located.map((s) => s.coordinate) };
  }, [located]);

  const scene = useMemo<MapScene>(() => {
    const contentInsets = { top: insets.top + 56, left: spacing.md, right: spacing.md };
    if (!mapContent) return { key: `tour-${id}`, contentInsets };
    // Selecting a stop drops the camera onto that point at a mid "neighbourhood"
    // zoom (full detail is what the venue page is for); otherwise fit the tour.
    const selectedCoord = selectedStopId
      ? (located.find((s) => s.id === selectedStopId)?.coordinate ?? null)
      : null;
    return {
      key: `tour-${id}`,
      // Re-frame only when the selected stop changes (or is cleared), not on
      // unrelated data changes.
      frameKey: `tour-${id}-${selectedStopId ?? 'all'}`,
      markers: mapContent.markers,
      lines: mapContent.lines,
      focus: selectedCoord ? [selectedCoord] : mapContent.focus,
      singleZoom: selectedCoord ? STOP_FOCUS_ZOOM : 9,
      contentInsets,
      onSelectStop,
    };
  }, [mapContent, located, id, insets.top, onSelectStop, selectedStopId]);

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

  const range = tour ? formatDateRange(tour.start_date, tour.end_date) : null;

  const sheetHeader = tour ? (
    <View style={styles.sheetHeader}>
      <Text
        variant="title"
        color="primary"
        numberOfLines={1}
        onPress={() => router.push({ pathname: '/acts/[id]', params: { id: tour.act.id } })}
      >
        {tour.act.name}
      </Text>
      {!!tour.title && <Text color="textMuted">{tour.title}</Text>}
      {!!range && (
        <Text variant="caption" color="textMuted">
          {range}
        </Text>
      )}
    </View>
  ) : null;

  // Navigation order for the prev/next arrows: every stop that has a point on
  // the map, in itinerary order.
  const navIndex = selectedStopId ? located.findIndex((s) => s.id === selectedStopId) : -1;
  const prevStopId = navIndex > 0 ? located[navIndex - 1].id : null;
  const nextStopId =
    navIndex >= 0 && navIndex < located.length - 1 ? located[navIndex + 1].id : null;

  const floating = selectedStop ? (
    <VenueStopCard
      key={selectedStop.id}
      stop={selectedStop}
      showNumber={showNumberById.get(selectedStop.id) ?? null}
      currentUserId={session?.user.id ?? null}
      topInset={insets.top}
      onClose={() => setSelectedStopId(null)}
      onPrev={prevStopId ? () => setSelectedStopId(prevStopId) : undefined}
      onNext={nextStopId ? () => setSelectedStopId(nextStopId) : undefined}
      onOpenVenue={
        selectedStop.venueId
          ? () =>
              router.push({
                pathname: '/venues/[id]',
                params: { id: selectedStop.venueId as string },
              })
          : undefined
      }
    />
  ) : null;

  return (
    <MapScreenScaffold
      scene={scene}
      onBack={() => router.back()}
      backLabel="Tours"
      topInset={insets.top}
      initialSnapIndex={1}
      sheetHeader={tour ? sheetHeader : undefined}
      floating={floating}
    >
      {tourQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : tourQuery.isError || !tour ? (
        <View style={styles.center}>
          <Text color="danger">Couldn&apos;t load this tour.</Text>
          <Button title="Retry" variant="secondary" onPress={() => tourQuery.refetch()} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          {isCreator && (
            <View style={styles.creatorActions}>
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

          {stops.length > 0 && <TourStatsSection stops={stops} />}

          <Text variant="heading" style={styles.itineraryHeading}>
            Itinerary
          </Text>

          {stopsQuery.isLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : stopsQuery.isError ? (
            <View style={styles.emptyState}>
              <Text color="danger">Couldn&apos;t load the itinerary.</Text>
              <Button title="Retry" variant="secondary" onPress={() => stopsQuery.refetch()} />
            </View>
          ) : stops.length === 0 ? (
            <View style={styles.emptyState}>
              <Text color="textMuted" style={styles.emptyHint}>
                Nothing scheduled yet.
              </Text>
            </View>
          ) : (
            <View style={styles.itinerary}>
              {stops.map((item) => (
                <StopRow
                  key={item.id}
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
              ))}
            </View>
          )}

          {isMember && (
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
          )}
        </ScrollView>
      )}
    </MapScreenScaffold>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    sheetHeader: {
      paddingBottom: spacing.sm,
      gap: 2,
    },
    venueCard: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      overflow: 'hidden',
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.md,
      gap: 2,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    venueCardTint: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      opacity: 0.75,
    },
    venueCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    venueKicker: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1.3,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    venueCardNav: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    navButton: {
      minWidth: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navArrow: {
      fontSize: 22,
      lineHeight: 22,
      color: colors.primary,
    },
    navArrowDisabled: {
      color: colors.textMuted,
      opacity: 0.35,
    },
    venueCardMeta: {
      paddingTop: spacing.xs,
    },
    venueCardLink: {
      paddingTop: spacing.sm,
    },
    body: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
      gap: spacing.md,
    },
    creatorActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.md,
    },
    members: {
      gap: spacing.sm,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    itineraryHeading: {
      paddingTop: spacing.xs,
    },
    itinerary: {
      gap: spacing.sm,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      padding: spacing.xl,
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
      paddingTop: spacing.xs,
    },
    actionButton: {
      flex: 1,
    },
  });
