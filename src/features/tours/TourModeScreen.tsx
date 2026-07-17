import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { Text } from '@/components/Text';
import { useCurrentLocation } from '@/features/location/useCurrentLocation';
import { MapScreenScaffold } from '@/features/maps/MapScreenScaffold';
import { TAB_BAR_HEIGHT, type Coord, type MapScene, type SceneMarker } from '@/features/maps/mapScene';
import type { TourStop } from '@/features/shows/api';
import { useStops } from '@/features/shows/queries';
import type { MyTour } from '@/features/tours/api';
import { pickCurrentStop } from '@/features/tours/tourMode';
import { useDayWeather, useDaysWeather, type WeatherPoint } from '@/features/weather/queries';
import { formatShowDate } from '@/lib/date';
import { openDirections } from '@/lib/directions';
import { formatMiles, haversineMiles } from '@/lib/geo';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useTheme, useThemedStyles } from '@/theme/ThemeProvider';

// Keep the map the hero: peek the sheet low by default, drag up for detail.
const SNAP_FRACTIONS = [0.26, 0.58, 0.9];

function withAlpha(hex: string, alpha: number): string {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Frame both you and the venue only when they're close enough to read together;
// past this, the venue is too far to be useful so we just center on you.
const FRAME_BOTH_RADIUS_MILES = 5;

/** Rounds a coordinate so tiny GPS jitter doesn't re-frame the camera constantly. */
function coordKey(coord: Coord): string {
  return `${coord[0].toFixed(3)},${coord[1].toFixed(3)}`;
}

/**
 * A slowly pulsing "beacon" — a solid core with an expanding, fading ring —
 * signalling the live On Tour state.
 */
function Beacon({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <View style={beaconStyles.wrap}>
      <Animated.View
        style={[
          beaconStyles.ring,
          {
            backgroundColor: color,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [
              { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] }) },
            ],
          },
        ]}
      />
      <View style={[beaconStyles.core, { backgroundColor: color }]} />
    </View>
  );
}

const beaconStyles = StyleSheet.create({
  wrap: { width: 9, height: 9, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 9, height: 9, borderRadius: 5 },
  core: { width: 9, height: 9, borderRadius: 5 },
});

function stopVenueName(stop: ReturnType<typeof pickCurrentStop>): string {
  if (!stop) return 'Venue';
  if (stop.stop.kind === 'off') return stop.stop.location?.name || 'Off day';
  return stop.stop.location?.name || 'Venue TBD';
}

function stopKindIcon(stop: TourStop): IconName {
  if (stop.kind === 'off') return 'bed';
  return stop.location?.booked ? 'business' : 'help-circle';
}

function stopTitle(stop: TourStop): string {
  if (stop.kind === 'off') return stop.location?.name || stop.location?.city || 'Day Off';
  return stop.location?.name || 'Venue TBD';
}

function stopCoord(stop: TourStop): Coord | null {
  const { latitude, longitude } = stop.location ?? {};
  return latitude != null && longitude != null ? [longitude, latitude] : null;
}

export function TourModeScreen({
  tour,
  todayISO,
  onViewList,
}: {
  tour: MyTour;
  todayISO: string;
  onViewList: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const { scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomChrome = TAB_BAR_HEIGHT + insets.bottom;

  const stopsQuery = useStops(tour.id);
  const stops = stopsQuery.data ?? [];

  const current = useMemo(() => pickCurrentStop(stops, todayISO), [stops, todayISO]);
  const venueCoord = current?.coordinate ?? null;

  // The next stops after the current one, for the "Coming up" list.
  const upcomingStops = useMemo(() => {
    if (!current) return [];
    const sorted = [...stops].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const idx = sorted.findIndex((s) => s.id === current.stop.id);
    if (idx < 0) return [];
    return sorted.slice(idx + 1, idx + 6);
  }, [stops, current]);

  const upcomingWeatherPoints = useMemo<WeatherPoint[]>(
    () => upcomingStops.map((s) => ({ key: s.id, coord: stopCoord(s), date: s.date })),
    [upcomingStops],
  );
  const upcomingWeather = useDaysWeather(upcomingWeatherPoints);

  // Only ask for the device's location once there's a venue to frame it against.
  const { location, status, canAskAgain, refresh } = useCurrentLocation(!!venueCoord);
  const userCoord = location?.coordinate ?? null;

  const distanceMiles = useMemo(() => {
    if (!userCoord || !venueCoord) return null;
    return haversineMiles(userCoord[1], userCoord[0], venueCoord[1], venueCoord[0]);
  }, [userCoord, venueCoord]);

  const weather = useDayWeather(venueCoord, current?.stop.date ?? null);

  // Camera intent the user has expressed: `auto` = distance-aware default;
  // `venue`/`user` = an explicit focus. The nonce lets repeated taps re-aim even
  // when the target coordinate hasn't changed.
  const [focusIntent, setFocusIntent] = useState<'auto' | 'venue' | 'user'>('auto');
  const [focusNonce, setFocusNonce] = useState(0);

  const focusVenue = useCallback(() => {
    setFocusIntent('venue');
    setFocusNonce((n) => n + 1);
  }, []);

  const recenterOnMe = useCallback(() => {
    if (!userCoord) void refresh();
    setFocusIntent('user');
    setFocusNonce((n) => n + 1);
  }, [userCoord, refresh]);

  const openTour = useCallback(
    () => router.push({ pathname: '/tours/[id]', params: { id: tour.id } }),
    [router, tour.id],
  );

  const openDirectionsToVenue = useCallback(() => {
    if (!venueCoord) return;
    void openDirections(venueCoord[1], venueCoord[0], stopVenueName(current));
  }, [venueCoord, current]);

  // Open a stop's venue page (with its info pane) — same destination as tapping
  // a stop elsewhere. Labelled so the venue's back button returns "On Tour".
  const openVenue = useCallback(
    (venueId: string) =>
      router.push({ pathname: '/venues/[id]', params: { id: venueId, backLabel: 'On Tour' } }),
    [router],
  );

  // Tapping the venue pin surfaces its actions — directions or full details.
  const handleSelectMarker = useCallback(
    (marker: SceneMarker) => {
      if (marker.kind !== 'venue' || !venueCoord) return;
      Alert.alert(stopVenueName(current), current?.stop.location?.city || undefined, [
        { text: 'Get directions', onPress: openDirectionsToVenue },
        { text: 'View tour details', onPress: openTour },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [venueCoord, current, openDirectionsToVenue, openTour],
  );

  const scene = useMemo<MapScene>(() => {
    const contentInsets = { top: insets.top + 56, left: spacing.md, right: spacing.md };
    if (!venueCoord) {
      return { key: 'tour-mode', contentInsets };
    }

    const markers: SceneMarker[] = [
      { id: 'venue', coordinate: venueCoord, kind: 'venue', label: stopVenueName(current) },
    ];
    if (userCoord) {
      markers.push({ id: 'you', coordinate: userCoord, kind: 'you', label: 'You' });
    }

    // Explicit user intent wins; otherwise frame both points only when you're
    // near the venue (a two-point fit across a whole state/country isn't useful),
    // else just center on you.
    let focus: Coord[];
    if (focusIntent === 'venue') {
      focus = [venueCoord];
    } else if (focusIntent === 'user') {
      focus = userCoord ? [userCoord] : [venueCoord];
    } else {
      const frameBoth =
        !!userCoord && distanceMiles != null && distanceMiles <= FRAME_BOTH_RADIUS_MILES;
      focus = frameBoth ? [userCoord!, venueCoord] : userCoord ? [userCoord] : [venueCoord];
    }
    const frameKey = `tour-mode-${tour.id}-${focusIntent}-${focusNonce}-${focus
      .map(coordKey)
      .join('|')}`;

    return {
      key: 'tour-mode',
      frameKey,
      // Omit `variant` so the shared theme-aware basemap is used (Dark in dark
      // mode), matching the rest of the app instead of a bright street map.
      markers,
      focus,
      // Both points: fit them with padding. Single point: a comfortable city zoom
      // (a touch closer when the user explicitly aimed at the venue).
      focusMode: 'bounds',
      singleZoom: focusIntent === 'venue' ? 14 : 13,
      focusDurationMs: 900,
      contentInsets,
      onSelectMarker: handleSelectMarker,
    };
  }, [
    venueCoord,
    userCoord,
    distanceMiles,
    current,
    tour.id,
    insets.top,
    handleSelectMarker,
    focusIntent,
    focusNonce,
  ]);

  const venueName = stopVenueName(current);
  const venueCity = current?.stop.location?.city ?? '';
  const venueDate = current ? formatShowDate(current.stop.date) : null;
  const isToday = current?.stop.date === todayISO;

  const weatherData = weather.data ?? null;
  const showsCurrentTemp = isToday && weatherData?.currentF != null;
  const weatherTemp = weatherData
    ? `${showsCurrentTemp ? weatherData.currentF : weatherData.highF}°`
    : null;

  const floating =
    venueCoord != null ? (
      <View style={[styles.mapControls, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <Pressable
          onPress={recenterOnMe}
          accessibilityRole="button"
          accessibilityLabel="Recenter on my location"
          hitSlop={8}
          style={styles.mapControlBtn}
        >
          <BlurView
            intensity={scheme === 'dark' ? 40 : 60}
            tint={scheme === 'dark' ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.mapControlTint} pointerEvents="none" />
          <Icon name="locate" size={22} color="primary" />
        </Pressable>
      </View>
    ) : null;

  const sheetHeader = (
    <View style={styles.sheetHeader}>
      <View style={styles.headerTopRow}>
        <View style={styles.badge}>
          <Beacon color={colors.success} />
          <Text style={styles.badgeText}>On Tour</Text>
        </View>
        <Pressable
          onPress={onViewList}
          accessibilityRole="button"
          accessibilityLabel="View all tours"
          hitSlop={8}
          style={({ pressed }) => [styles.viewToursBtn, pressed && styles.pressed]}
        >
          <Icon name="list" size={16} color="textSecondary" />
          <Text variant="caption" weight="semibold" color="textSecondary">
            All tours
          </Text>
        </Pressable>
      </View>
      <Text variant="title" numberOfLines={1}>
        {tour.act.name}
      </Text>
      {!!tour.title && (
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {tour.title}
        </Text>
      )}
    </View>
  );

  return (
    <MapScreenScaffold
      scene={scene}
      bottomChrome={bottomChrome}
      topInset={insets.top}
      snapFractions={SNAP_FRACTIONS}
      initialSnapIndex={0}
      sheetHeader={sheetHeader}
      floating={floating}
    >
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: spacing.xl }]}>
        {stopsQuery.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !current ? (
          <View style={styles.card}>
            <Text variant="heading">No location yet</Text>
            <Text color="textMuted" style={styles.hint}>
              This tour doesn&apos;t have a stop with a location around today, so there&apos;s nothing
              to point you toward yet.
            </Text>
            <Button title="View tour" variant="secondary" onPress={openTour} />
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardKicker}>{isToday ? 'TODAY' : 'NEXT STOP'}</Text>
              <View style={styles.venueRow}>
                <View style={styles.venueMarker}>
                  <View style={styles.venueMarkerInner} />
                </View>
                <View style={styles.venueText}>
                  <Text variant="heading" numberOfLines={1}>
                    {venueName}
                  </Text>
                  {!!venueCity && venueCity !== venueName && (
                    <Text variant="caption" color="textMuted" numberOfLines={1}>
                      {venueCity}
                    </Text>
                  )}
                  {!!venueDate && (
                    <Text variant="caption" color="textMuted">
                      {venueDate}
                    </Text>
                  )}
                </View>
              </View>

              {weatherData && (
                <View style={styles.weatherRow}>
                  <Icon name={weatherData.condition.icon} size={26} color="primary" />
                  <View style={styles.weatherText}>
                    <Text variant="subheading">{weatherTemp}</Text>
                    <Text variant="caption" color="textMuted">
                      {weatherData.condition.label} · H {weatherData.highF}° · L {weatherData.lowF}°
                    </Text>
                  </View>
                </View>
              )}

              {distanceMiles != null && (
                <Pressable
                  onPress={focusVenue}
                  accessibilityRole="button"
                  accessibilityLabel="Focus the map on the venue"
                  hitSlop={6}
                  style={({ pressed }) => [styles.distanceRow, pressed && styles.pressed]}
                >
                  <Icon name="navigate" size={16} color="primary" />
                  <Text variant="body" weight="semibold" color="primary">
                    {formatMiles(distanceMiles)} away
                  </Text>
                  <Text variant="caption" color="textMuted">
                    · tap to focus venue
                  </Text>
                </Pressable>
              )}

              {!!venueCoord && (
                <Button title="Get directions" onPress={openDirectionsToVenue} />
              )}
            </View>

            {upcomingStops.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardKicker}>COMING UP</Text>
                {upcomingStops.map((stop) => {
                  const title = stopTitle(stop);
                  const city = stop.location?.city;
                  const dayWeather = upcomingWeather.get(stop.id) ?? null;
                  const venueId = stop.venueId;
                  return (
                    <Pressable
                      key={stop.id}
                      onPress={venueId ? () => openVenue(venueId) : undefined}
                      disabled={!venueId}
                      accessibilityRole={venueId ? 'button' : undefined}
                      style={({ pressed }) => [
                        styles.stopRow,
                        pressed && !!venueId && styles.pressed,
                      ]}
                    >
                      <View style={styles.stopIcon}>
                        <Icon name={stopKindIcon(stop)} size={16} color="primary" />
                      </View>
                      <View style={styles.stopInfo}>
                        <Text variant="body" numberOfLines={1}>
                          {title}
                        </Text>
                        {!!city && city !== title && (
                          <Text variant="caption" color="textMuted" numberOfLines={1}>
                            {city}
                          </Text>
                        )}
                      </View>
                      <View style={styles.stopMeta}>
                        <Text variant="caption" color="textMuted">
                          {formatShowDate(stop.date)}
                        </Text>
                        {dayWeather && (
                          <View style={styles.stopWeather}>
                            <Icon name={dayWeather.condition.icon} size={14} color="textSecondary" />
                            <Text variant="caption" color="textSecondary">
                              {dayWeather.highF}° / {dayWeather.lowF}°
                            </Text>
                          </View>
                        )}
                      </View>
                      {!!venueId && <Icon name="chevron-forward" size={16} color="textMuted" />}
                    </Pressable>
                  );
                })}
              </View>
            )}

            {status === 'requesting' && (
              <View style={styles.statusRow}>
                <ActivityIndicator color={colors.primary} />
                <Text color="textMuted">Finding your location…</Text>
              </View>
            )}

            {status === 'denied' && (
              <View style={styles.card}>
                <Text variant="subheading">Location off</Text>
                <Text color="textMuted" style={styles.hint}>
                  Turn on location to keep you and the venue in view.
                </Text>
                {canAskAgain ? (
                  <Button title="Enable location" onPress={refresh} />
                ) : (
                  <Button title="Open settings" variant="secondary" onPress={() => Linking.openSettings()} />
                )}
              </View>
            )}

            {status === 'unavailable' && (
              <View style={styles.statusRow}>
                <Text color="textMuted">Couldn&apos;t get your location.</Text>
                <Pressable onPress={refresh} hitSlop={8}>
                  <Text color="primary" weight="semibold">
                    Retry
                  </Text>
                </Pressable>
              </View>
            )}

            <Pressable
              onPress={openTour}
              accessibilityRole="button"
              style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
            >
              <Text variant="body" color="primary" weight="semibold">
                View full tour
              </Text>
              <Icon name="chevron-forward" size={16} color="primary" />
            </Pressable>
          </>
        )}
      </ScrollView>
    </MapScreenScaffold>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    sheetHeader: {
      paddingBottom: spacing.sm,
      gap: 4,
    },
    headerTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      alignSelf: 'flex-start',
      paddingVertical: 3,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: withAlpha(colors.success, 0.14),
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1.2,
      color: colors.success,
    },
    viewToursBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xxs,
      paddingVertical: spacing.xxs,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
    },
    body: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
      gap: spacing.md,
    },
    card: {
      gap: spacing.sm,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    cardKicker: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    venueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    venueMarker: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.primary,
      backgroundColor: colors.onPrimary,
    },
    venueMarkerInner: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: colors.primary,
    },
    venueText: {
      flex: 1,
      gap: 1,
    },
    distanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    weatherRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingTop: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    weatherText: {
      flex: 1,
      gap: 1,
    },
    stopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    stopIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    stopInfo: {
      flex: 1,
      gap: 1,
    },
    stopMeta: {
      alignItems: 'flex-end',
      gap: 2,
    },
    stopWeather: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xxs,
    },
    mapControls: {
      position: 'absolute',
      right: spacing.md,
    },
    mapControlBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    mapControlTint: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      opacity: 0.7,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    hint: {
      lineHeight: 20,
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xxs,
      paddingVertical: spacing.sm,
    },
    pressed: {
      opacity: 0.7,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.xl,
    },
  });
