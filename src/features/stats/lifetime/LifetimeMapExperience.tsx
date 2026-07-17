import { BlurView } from 'expo-blur';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {
  BottomSheet,
  BOTTOM_SHEET_INSET,
  type BottomSheetHandle,
} from '@/components/BottomSheet';
import { Icon, type IconName } from '@/components/Icon';
import { Text } from '@/components/Text';
import type { MapStyleVariant } from '@/features/maps/mapConfig';
import {
  useMapScreen,
  type MapPlace,
  type MapScene,
  type PlacesMapMode,
  type RouteLine,
} from '@/features/maps/mapScene';
import type { PassportStats } from '@/features/stats/types';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { LifetimeHeader } from './LifetimeHeader';
import { PlaceDetailCard } from './PlaceDetailCard';
import { StatsContent } from './StatsContent';

/** Basemap choices on Lifetime — Standard dusk/night stay moodier than classic styles. */
const MAP_STYLES: { id: MapStyleVariant; icon: IconName; label: string }[] = [
  { id: 'minimal', icon: 'map-outline', label: 'Default' },
  { id: 'dusk', icon: 'partly-sunny-outline', label: 'Dusk' },
  { id: 'night', icon: 'moon-outline', label: 'Night' },
  { id: 'satellite', icon: 'earth-outline', label: 'Earth' },
];

export type LifetimeStatus = 'loading' | 'error' | 'empty' | 'ready';

type Props = {
  title: string;
  status: LifetimeStatus;
  stats: PassportStats | null;
  places: MapPlace[];
  routes: RouteLine[];
  years: number[];
  selectedYear: number | null;
  onSelectYear: (year: number | null) => void;
  onPressPerson: (userId: string) => void;
  onRetry: () => void;
  /** Height of the tab bar to keep the map + overlay clear of. */
  bottomChrome?: number;
};

// Lifetime opens at a low mid-snap so the map stays dominant; the condensed
// overview fits that strip. Drag up for the fuller stats. Tour lists keep their
// own (higher) snaps elsewhere.
const SNAP_FRACTIONS = [0.14, 0.36, 0.92];
const INITIAL_SNAP = 1;

/**
 * The Lifetime experience as a living map: a full-bleed map is the root layer,
 * with a floating header and a gesture-driven stats sheet above it. A shared
 * `sheetProgress` value connects the sheet's motion to the header (which
 * compresses) and the map (whose camera reframes to keep routes clear of the
 * sheet), so the whole surface feels like one physical, spatial object.
 */
export function LifetimeMapExperience({
  title,
  status,
  stats,
  places,
  routes,
  years,
  selectedYear,
  onSelectYear,
  onPressPerson,
  onRetry,
  bottomChrome = 0,
}: Props) {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<PlacesMapMode>('routes');
  const [mapStyle, setMapStyle] = useState<MapStyleVariant>('minimal');
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [headerHeight, setHeaderHeight] = useState(0);
  const [mapBottomInset, setMapBottomInset] = useState(0);

  const sheetProgress = useSharedValue(0);
  // 1 while the sheet is dragging/springing, 0 at rest — fades the map toggle.
  const sheetMotion = useSharedValue(0);
  const sheetRef = useRef<BottomSheetHandle>(null);

  const canShowRoutes = routes.length > 0;
  const effectiveMode: PlacesMapMode = canShowRoutes ? mode : 'places';

  const snapPoints = useMemo(() => {
    if (size.height === 0) return [];
    return SNAP_FRACTIONS.map((f) => Math.round(size.height * f));
  }, [size.height]);

  // Frame the map above whichever snap the sheet rests on — but never let the
  // fully-expanded sheet crush the camera into a sliver; cap the reserved space.
  const bottomInsetForSnap = useCallback(
    (snapHeight: number) =>
      Math.min(snapHeight + BOTTOM_SHEET_INSET, Math.round(size.height * 0.5)),
    [size.height],
  );

  const [snapIndex, setSnapIndex] = useState(INITIAL_SNAP);

  const handleSnapChange = useCallback(
    (index: number) => {
      setSnapIndex(index);
      const snapHeight = snapPoints[index];
      if (snapHeight != null) setMapBottomInset(bottomInsetForSnap(snapHeight));
    },
    [snapPoints, bottomInsetForSnap],
  );

  // Initialise the map's reserved bottom space once we know the sheet geometry.
  useEffect(() => {
    const snapHeight = snapPoints[INITIAL_SNAP];
    if (snapHeight != null) setMapBottomInset(bottomInsetForSnap(snapHeight));
  }, [snapPoints, bottomInsetForSnap]);

  const onRootLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };

  const onHeaderLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setHeaderHeight((prev) => (Math.abs(prev - h) < 1 ? prev : h));
  };

  const ready = status === 'ready' && stats != null;

  const selectedPlace = selectedPlaceId
    ? (places.find((p) => p.id === selectedPlaceId) ?? null)
    : null;

  // Drop selection when the place leaves the filtered set (e.g. year change).
  useEffect(() => {
    if (selectedPlaceId && !places.some((p) => p.id === selectedPlaceId)) {
      setSelectedPlaceId(null);
    }
  }, [places, selectedPlaceId]);

  // Tapping a place selects it and drops the sheet so the map + card are clear.
  const onSelectPlace = useCallback((id: string | null) => {
    setSelectedPlaceId(id);
    if (id) sheetRef.current?.snapTo(0);
  }, []);

  const onPressMapBackground = useCallback(() => setSelectedPlaceId(null), []);

  const onChangeMode = useCallback((next: PlacesMapMode) => {
    setMode(next);
    setSelectedPlaceId(null);
  }, []);

  // Feed the shared, persistent map. Memoised so the scene only changes (and the
  // camera only re-frames) when the data, overlay, or reserved space actually move.
  const scene = useMemo<MapScene>(
    () => ({
      key: 'lifetime',
      // Reframe when the year filter or places/routes mode changes so the camera
      // tracks the trimmed overview of the visible data.
      frameKey: `lifetime-${selectedYear ?? 'all'}-${effectiveMode}`,
      focusMode: 'trimmed',
      variant: mapStyle,
      places,
      routes,
      placesMode: effectiveMode,
      selectedPlaceId,
      contentInsets: {
        top: headerHeight,
        bottom: mapBottomInset,
        left: spacing.md,
        right: spacing.md,
      },
      onSelectPlace,
      onPressMapBackground,
      bottomChrome,
    }),
    [
      mapStyle,
      places,
      routes,
      effectiveMode,
      selectedYear,
      selectedPlaceId,
      headerHeight,
      mapBottomInset,
      onSelectPlace,
      onPressMapBackground,
      bottomChrome,
    ],
  );

  const sheetHeader = (
    <View style={styles.sheetHeader}>
      <Text variant="subheading">{selectedYear == null ? 'All time' : String(selectedYear)}</Text>
    </View>
  );

  const restingSnapHeight = snapPoints[snapIndex] ?? 0;
  const atTopSnap = snapPoints.length > 0 && snapIndex === snapPoints.length - 1;

  const overlay = (
    <View style={styles.root} onLayout={onRootLayout} pointerEvents="box-none">
      <LifetimeHeader
        title={title}
        progress={sheetProgress}
        topInset={insets.top}
        years={years}
        selectedYear={selectedYear}
        onSelectYear={onSelectYear}
        onLayout={onHeaderLayout}
      />

      {snapPoints.length > 0 && (
        <MapStyleToggle
          style={mapStyle}
          onChange={setMapStyle}
          motion={sheetMotion}
          restingHeight={restingSnapHeight}
          hidden={atTopSnap}
        />
      )}

      {canShowRoutes && snapPoints.length > 0 && (
        <MapModeToggle
          mode={effectiveMode}
          onChange={onChangeMode}
          motion={sheetMotion}
          restingHeight={restingSnapHeight}
          hidden={atTopSnap}
        />
      )}

      {selectedPlace && headerHeight > 0 && (
        <PlaceDetailCard
          key={selectedPlace.id}
          place={selectedPlace}
          top={headerHeight + spacing.xs}
          onClose={() => setSelectedPlaceId(null)}
        />
      )}

      {snapPoints.length > 0 && (
        <BottomSheet
          ref={sheetRef}
          snapPoints={snapPoints}
          initialIndex={INITIAL_SNAP}
          progress={sheetProgress}
          motion={sheetMotion}
          onSnapChange={handleSnapChange}
          header={sheetHeader}
        >
          {status === 'loading' ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : status === 'error' ? (
            <View style={styles.center}>
              <Text color="danger">Couldn&apos;t load your stats.</Text>
              <Pressable onPress={onRetry} accessibilityRole="button" style={styles.retry}>
                <Text color="primary">Retry</Text>
              </Pressable>
            </View>
          ) : !ready ? (
            <View style={styles.center}>
              <Text variant="heading">No tours yet</Text>
              <Text color="textMuted" style={styles.emptyHint}>
                Join or create a tour to start building your lifetime on the map.
              </Text>
            </View>
          ) : (
            <StatsContent stats={stats} bottomInset={insets.bottom} onPressPerson={onPressPerson} />
          )}
        </BottomSheet>
      )}
    </View>
  );

  // The map is drawn by the shared stage; this screen only contributes its
  // scene + floating overlay UI (rendered by the overlay outlet above the map).
  useMapScreen(scene, overlay);
  return null;
}

/**
 * Floating controls pinned to the sheet's resting top edge. They fade out while
 * the sheet is moving (and when fully expanded) so they don't chase the spring.
 */
function useFloatingToggleStyle(motion: SharedValue<number>, hidden: boolean) {
  const opacity = useDerivedValue(
    () => withTiming(hidden || motion.value > 0.5 ? 0 : 1, { duration: 160 }),
    [hidden],
  );
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

function MapStyleToggle({
  style,
  onChange,
  motion,
  restingHeight,
  hidden,
}: {
  style: MapStyleVariant;
  onChange: (style: MapStyleVariant) => void;
  motion: SharedValue<number>;
  restingHeight: number;
  hidden: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const { scheme } = useTheme();
  const animatedStyle = useFloatingToggleStyle(motion, hidden);

  return (
    <Animated.View
      style={[
        styles.toggle,
        styles.toggleLeft,
        {
          transform: [
            { translateY: -(restingHeight + BOTTOM_SHEET_INSET + spacing.sm) },
          ],
        },
        animatedStyle,
      ]}
      pointerEvents={hidden ? 'none' : 'box-none'}
    >
      <View style={styles.toggleInner}>
        <BlurView
          intensity={scheme === 'dark' ? 40 : 60}
          tint={scheme === 'dark' ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.toggleTint} pointerEvents="none" />
        {MAP_STYLES.map((opt) => (
          <ToggleButton
            key={opt.id}
            icon={opt.icon}
            label={opt.label}
            active={style === opt.id}
            onPress={() => onChange(opt.id)}
          />
        ))}
      </View>
    </Animated.View>
  );
}

function MapModeToggle({
  mode,
  onChange,
  motion,
  restingHeight,
  hidden,
}: {
  mode: PlacesMapMode;
  onChange: (mode: PlacesMapMode) => void;
  motion: SharedValue<number>;
  restingHeight: number;
  hidden: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const { scheme } = useTheme();
  const animatedStyle = useFloatingToggleStyle(motion, hidden);

  return (
    <Animated.View
      style={[
        styles.toggle,
        styles.toggleRight,
        {
          transform: [
            { translateY: -(restingHeight + BOTTOM_SHEET_INSET + spacing.sm) },
          ],
        },
        animatedStyle,
      ]}
      pointerEvents={hidden ? 'none' : 'box-none'}
    >
      <View style={styles.toggleInner}>
        <BlurView
          intensity={scheme === 'dark' ? 40 : 60}
          tint={scheme === 'dark' ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.toggleTint} pointerEvents="none" />
        <ToggleButton
          icon="git-network-outline"
          label="Routes"
          active={mode === 'routes'}
          onPress={() => onChange('routes')}
        />
        <ToggleButton
          icon="location-outline"
          label="Places"
          active={mode === 'places'}
          onPress={() => onChange('places')}
        />
      </View>
    </Animated.View>
  );
}

function ToggleButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={[styles.toggleButton, active && styles.toggleButtonActive]}
    >
      <Icon name={icon} size={16} color={active ? 'onPrimary' : 'textSecondary'} />
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    toggle: {
      position: 'absolute',
      bottom: 0,
    },
    toggleLeft: {
      left: spacing.md,
    },
    toggleRight: {
      right: spacing.md,
    },
    toggleInner: {
      flexDirection: 'row',
      borderRadius: radius.full,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      padding: 2,
      gap: 2,
    },
    toggleTint: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      opacity: 0.7,
    },
    toggleButton: {
      width: 30,
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
    },
    toggleButtonActive: {
      backgroundColor: colors.primary,
    },
    sheetHeader: {
      paddingBottom: spacing.sm,
      gap: 2,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      padding: spacing.xl,
    },
    retry: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    emptyHint: {
      textAlign: 'center',
    },
  });
