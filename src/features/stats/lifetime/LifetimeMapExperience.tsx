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
import { BottomSheet, type BottomSheetHandle } from '@/components/BottomSheet';
import { Icon, type IconName } from '@/components/Icon';
import { Text } from '@/components/Text';
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
import { StatsContent } from './StatsContent';

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

// Snap points as a fraction of the available (map) height. Lifetime opens higher
// than the tour lists so the stats hero is visible without dragging.
const SNAP_FRACTIONS = [0.16, 0.58, 0.92];
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
    (snapHeight: number) => Math.min(snapHeight, Math.round(size.height * 0.5)),
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

  // Tapping a place raises the sheet to its collapsed peek so the detail card is clear.
  const onPressPlace = useCallback(() => {
    sheetRef.current?.snapTo(0);
  }, []);

  // Feed the shared, persistent map. Memoised so the scene only changes (and the
  // camera only re-frames) when the data, overlay, or reserved space actually move.
  const scene = useMemo<MapScene>(
    () => ({
      key: 'lifetime',
      places,
      routes,
      placesMode: effectiveMode,
      contentInsets: {
        top: headerHeight,
        bottom: mapBottomInset,
        left: spacing.md,
        right: spacing.md,
      },
      onSelectPlace: onPressPlace,
      bottomChrome,
    }),
    [places, routes, effectiveMode, headerHeight, mapBottomInset, onPressPlace, bottomChrome],
  );

  const sheetHeader = (
    <View style={styles.sheetHeader}>
      <Text variant="subheading">{selectedYear == null ? 'All time' : String(selectedYear)}</Text>
      {ready && (
        <Text variant="caption" color="textMuted">
          {stats.tourCount} tour{stats.tourCount === 1 ? '' : 's'} · {stats.totalShows} show
          {stats.totalShows === 1 ? '' : 's'}
        </Text>
      )}
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

      {canShowRoutes && snapPoints.length > 0 && (
        <MapModeToggle
          mode={effectiveMode}
          onChange={setMode}
          motion={sheetMotion}
          restingHeight={restingSnapHeight}
          hidden={atTopSnap}
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
 * The Places/Routes switch, floating on the map just above the sheet's resting
 * top edge. Rather than chase the sheet mid-move (which looked like it lagged
 * behind during the spring), it's pinned to the *resting* snap height and fades
 * out whenever the sheet is in motion, fading back in at its new spot once the
 * sheet settles. It also hides while the sheet is fully expanded.
 */
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

  const opacity = useDerivedValue(
    () => withTiming(hidden || motion.value > 0.5 ? 0 : 1, { duration: 160 }),
    [hidden],
  );
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        styles.toggle,
        { transform: [{ translateY: -(restingHeight + spacing.sm) }] },
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
      right: spacing.md,
      bottom: 0,
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
