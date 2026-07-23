import { BlurView } from 'expo-blur';
import {
  forwardRef,
  useCallback,
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
  runOnUI,
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

/** Gap between the sheet and the screen edges so the map peeks around it. */
export const BOTTOM_SHEET_INSET = spacing.sm;

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
 * `header` region are the drag surface; the body scrolls independently.
 *
 * Height is animated to the active snap (anchored at the bottom) rather than
 * sliding a max-height panel with translateY. That way the body's ScrollView
 * viewport matches what's actually visible — otherwise mid-snap content that
 * fits the tall layout but sits below the fold can't be scrolled into view.
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

  // sheetHeight tracks the visible snap height. Internally we still reason in
  // "offset from max" (0 = tallest) so drag math stays simple.
  const offsets = useMemo(() => points.map((p) => maxHeight - p), [points, maxHeight]);
  const maxOffset = maxHeight - minHeight;

  const initialOffset = offsets[Math.min(initialIndex, offsets.length - 1)] ?? 0;
  const sheetHeight = useSharedValue(maxHeight - initialOffset);
  const startHeight = useSharedValue(maxHeight - initialOffset);

  // Seed `progress` from the resting snap once the geometry is known, so chrome
  // (header/map) starts in sync with where the sheet actually sits.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || maxHeight <= 0) return;
    seeded.current = true;
    const h = maxHeight - (offsets[Math.min(initialIndex, offsets.length - 1)] ?? 0);
    sheetHeight.value = h;
    progress.value = maxOffset > 0 ? (h - minHeight) / maxOffset : 1;
  }, [maxHeight, maxOffset, minHeight, offsets, initialIndex, progress, sheetHeight]);

  // Keep the latest snap-change handler in a ref so the function handed to
  // `runOnJS` has a *stable* identity. Previously a fresh closure was passed on
  // every render; swapping it mid-gesture forced the worklets runtime to
  // re-serialize it and could abort (toOptimizedObject / Value::getObject).
  const onSnapChangeRef = useRef(onSnapChange);
  useEffect(() => {
    onSnapChangeRef.current = onSnapChange;
  }, [onSnapChange]);
  const emitSnapChange = useCallback((index: number) => {
    onSnapChangeRef.current?.(index);
  }, []);

  // Build the gesture (and its worklets) once per geometry change instead of on
  // every render, so an in-flight drag or settling spring can't reference a torn
  // closure that was swapped out underneath it.
  const { gesture, settleTo } = useMemo(() => {
    const updateProgress = (h: number) => {
      'worklet';
      progress.value = maxOffset > 0 ? (h - minHeight) / maxOffset : 1;
    };

    const settle = (index: number) => {
      'worklet';
      const clamped = Math.max(0, Math.min(index, offsets.length - 1));
      const target = maxHeight - offsets[clamped];
      if (motion) motion.value = 1;
      sheetHeight.value = withSpring(target, SNAP_SPRING, (finished) => {
        if (finished) {
          updateProgress(target);
          if (motion) motion.value = 0;
        }
      });
      runOnJS(emitSnapChange)(clamped);
    };

    const nearestIndex = (h: number, velocity: number) => {
      'worklet';
      // Velocity is in the drag direction (down = shorter). Project a little along
      // the fling so a flick lands on the next snap.
      const projected = h - velocity * 0.08;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < points.length; i += 1) {
        const d = Math.abs(points[i] - projected);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      return best;
    };

    const pan = Gesture.Pan()
      .onStart(() => {
        startHeight.value = sheetHeight.value;
        if (motion) motion.value = 1;
      })
      .onUpdate((e) => {
        // Drag down → shorter sheet; drag up → taller.
        const next = startHeight.value - e.translationY;
        sheetHeight.value = Math.max(minHeight, Math.min(next, maxHeight));
        updateProgress(sheetHeight.value);
      })
      .onEnd((e) => {
        // Index rises as the snap gets taller. A strong upward fling steps to the
        // next-taller snap; a downward fling to the next-shorter one; otherwise we
        // settle on whichever snap is nearest.
        const current = nearestIndex(sheetHeight.value, 0);
        let index: number;
        if (e.velocityY < -FLING_VELOCITY) {
          index = Math.min(current + 1, points.length - 1);
        } else if (e.velocityY > FLING_VELOCITY) {
          index = Math.max(current - 1, 0);
        } else {
          index = nearestIndex(sheetHeight.value, e.velocityY);
        }
        settle(index);
      });

    return { gesture: pan, settleTo: settle };
  }, [points, offsets, maxHeight, minHeight, maxOffset, motion, progress, sheetHeight, startHeight, emitSnapChange]);

  // `settleTo` is a worklet; hop to the UI thread to run it (so its shared-value
  // writes and `runOnJS` fire in the normal UI→JS direction) instead of invoking
  // a worklet from JS, which would round-trip JS→worklet→JS.
  useImperativeHandle(ref, () => ({
    snapTo: (index: number) => runOnUI(settleTo)(index),
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    height: sheetHeight.value,
  }));

  // A soft shadow that deepens as the sheet rises, reinforcing the floating feel.
  const shadowStyle = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(progress.value, [0, 1], [0.12, 0.3], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View style={[styles.sheet, sheetStyle, shadowStyle]} pointerEvents="box-none">
      <BlurView
        intensity={scheme === 'dark' ? 28 : 42}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.surfaceTint} pointerEvents="none" />

      <GestureDetector gesture={gesture}>
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
      left: BOTTOM_SHEET_INSET,
      right: BOTTOM_SHEET_INSET,
      bottom: BOTTOM_SHEET_INSET,
      borderRadius: radius.xl,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      ...elevation.lg,
      shadowOffset: { width: 0, height: -4 },
    },
    // A light wash over the blur — translucent enough for the map to read
    // through at the edges, while header/body content stays fully opaque.
    surfaceTint: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      opacity: 0.55,
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
