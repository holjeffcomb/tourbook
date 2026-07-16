import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useActiveMapEntry } from './mapScene';

type Entry = NonNullable<ReturnType<typeof useActiveMapEntry>>;

// The incoming overlay fades in quickly so it covers the map in whatever region
// it shares with the outgoing one; the outgoing overlay fades out a bit slower so
// any area it *doesn't* share (e.g. Lifetime's tall card leaving for a short list
// card) reads as a smooth "fade to map" rather than lingering opaque then popping.
const ENTER_MS = 160;
const EXIT_MS = 260;

/**
 * Renders the focused map screen's overlay UI (header, bottom sheet, …) in a
 * layer that floats above the shared `MapStage`. Because the map sits on top of
 * the (empty) navigator, its own screens can't host interactive chrome — the UI
 * lives here instead, with `box-none` so empty areas pass touches to the map.
 *
 * Transitions cross-fade: the current overlay is keyed by screen identity, so a
 * new screen mounts (fading in) while the previous one unmounts (fading out) at
 * the same time. Re-registrations of the *same* screen (data/inset changes) keep
 * the same key, so they update in place without a remount or a re-fade — the
 * bottom sheet keeps its drag position across data updates.
 */
export function MapOverlayOutlet() {
  const entry = useActiveMapEntry();
  const [current, setCurrent] = useState<Entry | null>(entry ?? null);

  useEffect(() => {
    setCurrent(entry ?? null);
  }, [entry]);

  return (
    <View style={styles.root} pointerEvents="box-none">
      {current?.overlay ? (
        <Animated.View
          key={current.key}
          style={[styles.fill, { bottom: current.scene.bottomChrome ?? 0 }]}
          pointerEvents="box-none"
          entering={FadeIn.duration(ENTER_MS)}
          exiting={FadeOut.duration(EXIT_MS)}
        >
          {current.overlay}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
