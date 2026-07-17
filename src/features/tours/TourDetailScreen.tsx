import { BlurView } from 'expo-blur';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type BottomSheetHandle } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
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
  showNumber,
  selected,
  onPress,
  onLayout,
}: {
  stop: TourStop;
  showNumber: number | null;
  selected: boolean;
  onPress: () => void;
  onLayout?: (y: number) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const isOff = stop.kind === 'off';
  const booked = stop.location?.booked ?? false;
  const name = isOff
    ? stop.label || 'Off day'
    : stop.location?.name || (booked ? 'Venue' : 'Venue TBD');
  const city = stop.location?.city ?? '';
  const meta = [formatShowDate(stop.date), city].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onPress}
      onLayout={(e) => onLayout?.(e.nativeEvent.layout.y)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${formatShowDate(stop.date)}`}
      style={({ pressed }) => [
        styles.row,
        selected && styles.rowSelected,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={[styles.rowBadge, isOff && styles.rowBadgeOff, selected && styles.rowBadgeSelected]}>
        <Text style={[styles.rowBadgeText, isOff && styles.rowBadgeTextOff]}>
          {isOff ? '—' : (showNumber ?? '•')}
        </Text>
      </View>
      <View style={styles.rowInfo}>
        <Text variant="body" numberOfLines={1} style={styles.rowName}>
          {name}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {meta || 'Rest / travel day'}
        </Text>
      </View>
      {!isOff && !booked && (
        <Text variant="caption" color="textMuted" style={styles.rowTbd}>
          TBD
        </Text>
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

/**
 * A soft vertical fade (transparent → `color`) faked with stacked opacity bands,
 * so the hero flyer melts into the card without a native gradient dependency.
 */
function VerticalFade({ color }: { color: string }) {
  const styles = useThemedStyles(createStyles);
  const bands = 14;
  return (
    <View pointerEvents="none" style={styles.heroFade}>
      {Array.from({ length: bands }).map((_, i) => (
        <View
          key={i}
          style={{ flex: 1, backgroundColor: color, opacity: Math.pow((i + 1) / bands, 1.7) }}
        />
      ))}
    </View>
  );
}

/**
 * Hero card for the tour: the flyer fills the top, edge-to-edge, and fades into
 * the card surface, with the act / title / dates in the settled area below.
 * `flyerUri` is a placeholder hook until tours carry an uploaded flyer; the fade
 * colour could later be derived from the flyer's dominant colour.
 */
function TourHeroCard({
  actName,
  title,
  range,
  flyerUri,
}: {
  actName: string;
  title: string | null;
  range: string | null;
  flyerUri?: string | null;
}) {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const headline = title?.trim() || actName;
  const showKicker = !!title?.trim();

  return (
    <View style={styles.heroCard}>
      <View style={styles.heroImage}>
        {flyerUri ? (
          <Image source={{ uri: flyerUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={styles.heroPlaceholder}>
            <Icon name="image-outline" size={28} color="textMuted" />
            <Text variant="caption" color="textMuted" style={styles.heroPlaceholderText}>
              Tour flyer
            </Text>
          </View>
        )}
        <VerticalFade color={colors.surfaceElevated} />
      </View>
      <View style={styles.heroBody}>
        {showKicker && (
          <Text style={styles.heroKicker} numberOfLines={1}>
            {actName}
          </Text>
        )}
        <Text variant="title" numberOfLines={2}>
          {headline}
        </Text>
        {!!range && (
          <Text variant="caption" color="textMuted">
            {range}
          </Text>
        )}
      </View>
    </View>
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
  const onPressMapBackground = useCallback(() => setSelectedStopId(null), []);
  const sheetControlRef = useRef<BottomSheetHandle>(null);

  // Keep the itinerary list tracking the active stop: as the prev/next arrows or
  // map taps move the selection, scroll that row into view inside the sheet.
  const scrollRef = useRef<ScrollView>(null);
  const rowYRef = useRef<Map<string, number>>(new Map());
  const itineraryYRef = useRef(0);

  // Selecting from the itinerary list also drops the sheet so the highlighted
  // map point and its detail card are visible.
  const onSelectFromList = useCallback((stopId: string) => {
    setSelectedStopId(stopId);
    sheetControlRef.current?.snapTo(0);
  }, []);

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

  useEffect(() => {
    if (!selectedStopId) return;
    const y = rowYRef.current.get(selectedStopId);
    if (y == null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, itineraryYRef.current + y - 16), animated: true });
  }, [selectedStopId]);

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
      // A slow, whimsical glide between shows: `flyTo` arcs the camera out and
      // back in, so hopping stop-to-stop feels like drifting across the map.
      focusDurationMs: selectedCoord ? 2400 : 1100,
      focusAnimationMode: selectedCoord ? 'flyTo' : 'easeTo',
      contentInsets,
      onSelectStop,
      onPressMapBackground,
    };
  }, [mapContent, located, id, insets.top, onSelectStop, onPressMapBackground, selectedStopId]);

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
                params: {
                  id: selectedStop.venueId as string,
                  backLabel: tour?.act.name ?? 'Tour',
                },
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
      sheetControlRef={sheetControlRef}
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
          ref={scrollRef}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          <TourHeroCard actName={tour.act.name} title={tour.title} range={range} />

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
            <View
              style={styles.itinerary}
              onLayout={(e) => {
                itineraryYRef.current = e.nativeEvent.layout.y;
              }}
            >
              {stops.map((item) => (
                <StopRow
                  key={item.id}
                  stop={item}
                  showNumber={showNumberById.get(item.id) ?? null}
                  selected={item.id === selectedStopId}
                  onPress={() => onSelectFromList(item.id)}
                  onLayout={(y) => rowYRef.current.set(item.id, y)}
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
    heroCard: {
      overflow: 'hidden',
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
    },
    heroImage: {
      height: 190,
      width: '100%',
      backgroundColor: colors.surfaceMuted,
    },
    heroPlaceholder: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      backgroundColor: colors.primaryMuted,
    },
    heroPlaceholderText: {
      textTransform: 'uppercase',
      letterSpacing: 1,
      fontWeight: '600',
    },
    heroFade: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 120,
    },
    heroBody: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
      paddingBottom: spacing.md,
      gap: 2,
    },
    heroKicker: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1.3,
      textTransform: 'uppercase',
      color: colors.primary,
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
      gap: spacing.xs,
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
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    rowSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryMuted,
    },
    rowPressed: {
      opacity: 0.7,
    },
    rowBadge: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    rowBadgeOff: {
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rowBadgeSelected: {
      backgroundColor: colors.primary,
    },
    rowBadgeText: {
      color: colors.onPrimary,
      fontSize: 12,
      fontWeight: '700',
    },
    rowBadgeTextOff: {
      color: colors.textMuted,
    },
    rowInfo: {
      flex: 1,
      gap: 1,
    },
    rowName: {
      fontWeight: '600',
    },
    rowTbd: {
      fontWeight: '700',
      letterSpacing: 0.5,
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
