// The imperative player for the Lifetime "ambient" cinematic map.
//
// Given a pure `AmbientPlan` (built by `ambientPlan.ts`), this loops over its
// frames: it dissolves into each cluster — freezing the current frame as a
// snapshot image, jumping the camera underneath it, then fading the image out so
// the reposition is never seen (and never goes through black) — then slowly pans
// across the cluster with a single native `linearTo`. It pauses cleanly when the
// user interacts or a place is selected.
//
// This is the only stateful/impure part of the ambient system; all the geometry
// lives in the pure, unit-tested plan module.

import type { Camera, MapView } from '@rnmapbox/maps';
import { useEffect, useRef, useState, type ComponentRef, type RefObject } from 'react';
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { AmbientPlan, Coord } from './mapScene';

/** Snapshot crossfade duration (ms). */
const FADE_MS = 1000;
/** Smooth glide used only when a snapshot isn't available (still never black). */
const FALLBACK_GLIDE_MS = 2600;
/** Let the map/style paint before the first snapshot. */
const INITIAL_SETTLE_MS = 400;
/** Cap on waiting for the snapshot image to paint before jumping underneath it. */
const SNAP_PAINT_TIMEOUT_MS = 500;

type CameraMode = 'moveTo' | 'linearTo' | 'flyTo' | 'easeTo';

type Args = {
  cameraRef: RefObject<ComponentRef<typeof Camera> | null>;
  mapViewRef: RefObject<ComponentRef<typeof MapView> | null>;
  plan: AmbientPlan | null;
  paused: boolean;
};

/** `takeSnap` returns a bare path, a file uri, or base64 depending on platform. */
function normalizeSnapUri(value: string): string {
  if (value.startsWith('data:') || value.startsWith('file:') || value.startsWith('http')) {
    return value;
  }
  if (value.startsWith('/')) return `file://${value}`;
  return `data:image/png;base64,${value}`;
}

export function useAmbientCamera({ cameraRef, mapViewRef, plan, paused }: Args) {
  const [snapshotUri, setSnapshotUri] = useState<string | null>(null);
  const opacity = useSharedValue(0);
  // Persisted across pause/resume so we continue the itinerary, not restart it.
  const frameIndexRef = useRef(0);
  // Bumped to invalidate any in-flight async loop (pause / plan change / unmount).
  const genRef = useRef(0);
  // Resolver for "the snapshot image finished painting" (Image onLoad).
  const snapPaintedRef = useRef<(() => void) | null>(null);

  const onSnapshotLoad = () => {
    snapPaintedRef.current?.();
  };

  useEffect(() => {
    genRef.current += 1;
    const gen = genRef.current;
    const alive = () => gen === genRef.current;

    if (!plan || plan.frames.length === 0 || paused) {
      // Ensure a paused/hidden state never leaves a frozen snapshot on screen.
      opacity.value = 0;
      setSnapshotUri(null);
      return () => {};
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      });

    const setCam = (center: Coord, zoom: number, mode: CameraMode, duration: number) => {
      cameraRef.current?.setCamera({
        centerCoordinate: center,
        zoomLevel: zoom,
        animationMode: mode,
        animationDuration: duration,
      });
    };

    const takeSnapshot = async (): Promise<string | null> => {
      try {
        const view = mapViewRef.current as { takeSnap?: (write: boolean) => Promise<string> } | null;
        const uri = await view?.takeSnap?.(true);
        return typeof uri === 'string' && uri.length > 0 ? normalizeSnapUri(uri) : null;
      } catch {
        return null;
      }
    };

    // Resolve when the overlay <Image> reports it painted, or after a timeout so
    // we never stall the loop if onLoad doesn't fire.
    const waitForSnapshotPaint = () =>
      new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          snapPaintedRef.current = null;
          resolve();
        };
        snapPaintedRef.current = finish;
        setTimeout(finish, SNAP_PAINT_TIMEOUT_MS);
      });

    const fadeOutSnapshot = () =>
      new Promise<void>((resolve) => {
        opacity.value = withTiming(0, { duration: FADE_MS }, () => {
          runOnJS(resolve)();
        });
      });

    const dissolveTo = async (center: Coord, zoom: number) => {
      const snap = await takeSnapshot();
      if (!alive()) return;
      if (snap) {
        opacity.value = 1;
        setSnapshotUri(snap);
        await waitForSnapshotPaint();
        if (!alive()) return;
        // Jump underneath the frozen frame, then dissolve the frozen frame away.
        setCam(center, zoom, 'moveTo', 0);
        await fadeOutSnapshot();
        if (!alive()) return;
        setSnapshotUri(null);
      } else {
        // No snapshot support: glide smoothly instead of a hard cut.
        setCam(center, zoom, 'flyTo', FALLBACK_GLIDE_MS);
        await delay(FALLBACK_GLIDE_MS);
      }
    };

    const run = async () => {
      await delay(INITIAL_SETTLE_MS);
      while (alive()) {
        const frames = plan.frames;
        const i = frameIndexRef.current % frames.length;
        const frame = frames[i];

        await dissolveTo(frame.center, frame.zoom);
        if (!alive()) return;

        // Slow Ken Burns pan across the cluster at a fixed zoom.
        setCam(frame.driftTo, frame.zoom, 'linearTo', frame.dwellMs);
        await delay(frame.dwellMs);
        if (!alive()) return;

        frameIndexRef.current = (i + 1) % frames.length;
      }
    };

    void run();

    return () => {
      genRef.current += 1;
      if (timer) clearTimeout(timer);
      opacity.value = 0;
      setSnapshotUri(null);
    };
  }, [plan, paused, cameraRef, mapViewRef, opacity]);

  const snapshotStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return { snapshotUri, snapshotStyle, onSnapshotLoad };
}
