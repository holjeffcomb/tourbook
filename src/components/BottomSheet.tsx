import { BlurView } from 'expo-blur';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { elevation, radius, spacing, type ThemeColors } from '@/theme';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';

// A spring that feels like a physical object settling — quick to respond, gently
// damped so it never overshoots into a bounce.
const SNAP_SPRING = { damping: 22, stiffness: 220, mass: 0.7, overshootClamping: false };

// Above this flick velocity we jump toward the neighbour snap in the fling
// direction instead of picking the nearest point, so a fast drag "throws" it.
const FLING_VELOCITY = 550;

export type BottomSheetHandle = {
  /** Animate to a snap point by index (clamped to the available points). */
  snapTo: (index: number) => void;
};

type Props = {
  /** Snap heights in px, ascending (e.g. [collapsed, medium, expanded]). */
  snapPoints: number[];
  /** Snap index to rest at on first layout. */
  initialIndex?: number;
  /**
   * Written by the sheet every frame: 0 at the smallest snap, 1 at the largest.
   * Chrome (header, map insets) reads this to stay physically connected.
   */
  progress: SharedValue<number>;
  /**
   * 1 while the sheet is being dragged or springing between snaps, 0 at rest.
   * Chrome that shouldn't chase the sheet mid-move (e.g. the map toggle) reads
   * this to fade out during motion and back in once settled.
   */
  motion?: SharedValue<number>;
  /** Fired (on the JS thread) whenever the sheet settles on a new snap index. */
  onSnapChange?: (index: number) => void;
  /** Sticky, draggable region at the top of the sheet (grabber is drawn for you). */
  header?: ReactNode;
  /** Scrollable body content. */
  children: ReactNode;
};

/**
 * A translucent, multi-snap bottom sheet floating over the map. The grabber and
 * `header` region are the drag surface; the body scrolls independently. The
 * sheet is sized to its tallest snap point and slides down to reveal shorter
 * ones, so the map stays visible behind it at every position.
 */
export const BottomSheet = forwardRef<BottomSheetHandle, Props>(function BottomSheet(
  { snapPoints, initialIndex = 0, progress, motion, onSnapChange, header, children },
  ref,
) {
  const styles = useThemedStyles(createStyles);
  const { scheme } = useTheme();

  const points = useMemo(() => [...snapPoints].sort((a, b) => a - b), [snapPoints]);
  const maxHeight = points[points.length - 1] ?? 0;
  const minHeight = points[0] ?? 0;

  // translateY: 0 = fully expanded (tallest); larger = slid down (shorter).
  // offset(i) = maxHeight - points[i]. Range is [0, maxHeight - minHeight].
  const offsets = useMemo(() => points.map((p) => maxHeight - p), [points, maxHeight]);
  const maxOffset = maxHeight - minHeight;

  const translateY = useSharedValue(offsets[Math.min(initialIndex, offsets.length - 1)] ?? 0);
  const startY = useSharedValue(0);

  // Seed `progress` from the resting snap once the geometry is known, so chrome
  // (header/map) starts in sync with where the sheet actually sits.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || maxOffset <= 0) return;
    seeded.current = true;
    const y = offsets[Math.min(initialIndex, offsets.length - 1)] ?? 0;
    translateY.value = y;
    progress.value = 1 - y / maxOffset;
  }, [maxOffset, offsets, initialIndex, progress, translateY]);

  const updateProgress = (y: number) => {
    'worklet';
    progress.value = maxOffset > 0 ? 1 - y / maxOffset : 1;
  };

  const settleTo = (index: number) => {
    'worklet';
    const clamped = Math.max(0, Math.min(index, offsets.length - 1));
    if (motion) motion.value = 1;
    translateY.value = withSpring(offsets[clamped], SNAP_SPRING, (finished) => {
      if (finished) {
        updateProgress(offsets[clamped]);
        if (motion) motion.value = 0;
      }
    });
    if (onSnapChange) runOnJS(onSnapChange)(clamped);
  };

  useImperativeHandle(ref, () => ({
    snapTo: (index: number) => settleTo(index),
  }));

  const nearestIndex = (y: number, velocity: number) => {
    'worklet';
    // Project a little along the fling so a flick lands on the next snap.
    const projected = y + velocity * 0.08;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < offsets.length; i += 1) {
      const d = Math.abs(offsets[i] - projected);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  };

  const pan = Gesture.Pan()
    .onStart(() => {
      startY.value = translateY.value;
      if (motion) motion.value = 1;
    })
    .onUpdate((e) => {
      const next = startY.value + e.translationY;
      translateY.value = Math.max(0, Math.min(next, maxOffset));
      updateProgress(translateY.value);
    })
    .onEnd((e) => {
      // Index rises as the snap gets taller (offset shrinks). A strong upward
      // fling steps to the next-taller snap; a downward fling to the next-shorter
      // one; otherwise we settle on whichever snap is nearest.
      const current = nearestIndex(translateY.value, 0);
      let index: number;
      if (e.velocityY < -FLING_VELOCITY) {
        index = Math.min(current + 1, offsets.length - 1);
      } else if (e.velocityY > FLING_VELOCITY) {
        index = Math.max(current - 1, 0);
      } else {
        index = nearestIndex(translateY.value, e.velocityY);
      }
      settleTo(index);
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // A soft shadow that deepens as the sheet rises, reinforcing the floating feel.
  const shadowStyle = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(progress.value, [0, 1], [0.12, 0.3], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View
      style={[styles.sheet, { height: maxHeight }, sheetStyle, shadowStyle]}
      pointerEvents="box-none"
    >
      <BlurView
        intensity={scheme === 'dark' ? 40 : 60}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.surfaceTint} pointerEvents="none" />

      <GestureDetector gesture={pan}>
        <View style={styles.grabZone}>
          <View style={styles.grabber} />
          {header}
        </View>
      </GestureDetector>

      <View style={styles.body}>{children}</View>
    </Animated.View>
  );
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      overflow: 'hidden',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      ...elevation.lg,
      shadowOffset: { width: 0, height: -8 },
    },
    // A translucent wash over the blur so text stays legible on busy map areas.
    surfaceTint: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      opacity: 0.82,
    },
    grabZone: {
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 5,
      borderRadius: radius.full,
      backgroundColor: colors.borderStrong,
      marginBottom: spacing.xs,
    },
    body: {
      flex: 1,
    },
  });
