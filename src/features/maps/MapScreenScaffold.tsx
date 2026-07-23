import { BlurView } from 'expo-blur';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import {
  BottomSheet,
  BOTTOM_SHEET_INSET,
  type BottomSheetHandle,
} from '@/components/BottomSheet';
import { Text } from '@/components/Text';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { useMapScreen, type MapScene } from './mapScene';

type Props = {
  /** What the shared map should draw for this screen (camera, markers, lines). */
  scene: MapScene;
  /** Tab bar height to keep the map + overlay clear of (top-level tab screens). */
  bottomChrome?: number;
  /** When omitted, no back button is shown (e.g. top-level tab screens). */
  onBack?: () => void;
  backLabel?: string;
  title?: string;
  topInset: number;
  /** Default snap heights as fractions of the screen height. */
  snapFractions?: number[];
  initialSnapIndex?: number;
  /** Sticky drag region inside the sheet (title / summary line). */
  sheetHeader?: ReactNode;
  /** Floating chrome above the map/sheet (e.g. a tapped-marker detail card). */
  floating?: ReactNode;
  /** Imperative access to the bottom sheet (e.g. to snap it down on selection). */
  sheetControlRef?: Ref<BottomSheetHandle>;
  /** Scrollable sheet body. */
  children: ReactNode;
};

const DEFAULT_SNAP_FRACTIONS = [0.32, 0.62, 0.92];
const DEFAULT_INITIAL = 0;

/**
 * The shared chrome for a map-first screen: a transparent, touch-through layer
 * with a floating back button and a multi-snap bottom sheet, floated above the
 * app-wide `MapStage`. The screen renders nothing itself — this scaffold
 * registers the `scene` (drawn by the stage) and teleports this chrome into the
 * overlay layer above the map, keeping the map pan/zoom interactive underneath.
 */
export function MapScreenScaffold({
  scene,
  bottomChrome = 0,
  onBack,
  backLabel = 'Back',
  title,
  topInset,
  snapFractions = DEFAULT_SNAP_FRACTIONS,
  initialSnapIndex = DEFAULT_INITIAL,
  sheetHeader,
  floating,
  sheetControlRef,
  children,
}: Props) {
  const styles = useThemedStyles(createStyles);
  const { scheme } = useTheme();
  const [height, setHeight] = useState(0);
  const [reserved, setReserved] = useState(0);
  const sheetRef = useRef<BottomSheetHandle>(null);
  const progress = useSharedValue(0);

  useImperativeHandle(sheetControlRef, () => ({
    snapTo: (index: number) => sheetRef.current?.snapTo(index),
  }));

  const snapPoints = useMemo(() => {
    if (height === 0) return [];
    return snapFractions.map((f) => Math.round(height * f));
  }, [height, snapFractions]);

  const reservedFor = useCallback(
    (snapHeight: number) =>
      Math.min(snapHeight + BOTTOM_SHEET_INSET, Math.round(height * 0.5)),
    [height],
  );

  const handleSnapChange = useCallback(
    (index: number) => {
      const snapHeight = snapPoints[index];
      if (snapHeight != null) setReserved(reservedFor(snapHeight));
    },
    [snapPoints, reservedFor],
  );

  useEffect(() => {
    const snapHeight = snapPoints[Math.min(initialSnapIndex, snapPoints.length - 1)];
    if (snapHeight != null) setReserved(reservedFor(snapHeight));
  }, [snapPoints, initialSnapIndex, reservedFor]);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setHeight((prev) => (Math.abs(prev - h) < 1 ? prev : h));
  };

  // The scene the stage draws: keep the map clear of the sheet (bottom) and the
  // tab bar (bottomChrome), preserving whatever top/side insets the screen set.
  const mapScene = useMemo<MapScene>(
    () => ({
      ...scene,
      bottomChrome,
      contentInsets: { ...scene.contentInsets, bottom: reserved },
    }),
    [scene, bottomChrome, reserved],
  );

  const overlay = (
    <View style={styles.root} onLayout={onLayout} pointerEvents="box-none">
      <View style={[styles.topBar, { top: topInset + spacing.sm }]} pointerEvents="box-none">
        {onBack && (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            hitSlop={8}
            style={styles.backButton}
          >
            <BlurView
              intensity={scheme === 'dark' ? 40 : 60}
              tint={scheme === 'dark' ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.backTint} pointerEvents="none" />
            <Text variant="body" color="primary" style={styles.backText}>
              ‹ {backLabel}
            </Text>
          </Pressable>
        )}
        {!!title && (
          <View style={styles.titlePill}>
            <BlurView
              intensity={scheme === 'dark' ? 40 : 60}
              tint={scheme === 'dark' ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.backTint} pointerEvents="none" />
            <Text variant="body" numberOfLines={1} style={styles.titleText}>
              {title}
            </Text>
          </View>
        )}
      </View>

      {floating}

      {snapPoints.length > 0 && (
        <BottomSheet
          ref={sheetRef}
          snapPoints={snapPoints}
          initialIndex={initialSnapIndex}
          progress={progress}
          onSnapChange={handleSnapChange}
          header={sheetHeader}
        >
          {children}
        </BottomSheet>
      )}
    </View>
  );

  useMapScreen(mapScene, overlay);
  return null;
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    topBar: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    backButton: {
      overflow: 'hidden',
      borderRadius: radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    backTint: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      opacity: 0.7,
    },
    backText: {
      fontWeight: '600',
    },
    titlePill: {
      flexShrink: 1,
      overflow: 'hidden',
      borderRadius: radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    titleText: {
      fontWeight: '700',
    },
  });
