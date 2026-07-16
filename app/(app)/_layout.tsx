import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { FloatingTabBar, TabBarProvider } from '@/features/maps/FloatingTabBar';
import { MapOverlayOutlet } from '@/features/maps/MapOverlayOutlet';
import { MapStage } from '@/features/maps/MapStage';
import { MapSceneProvider } from '@/features/maps/mapScene';
import { useColors, useTheme } from '@/theme/ThemeProvider';

export default function AppLayout() {
  const colors = useColors();
  const { scheme } = useTheme();

  // The shared map is rendered on top of the navigator (so it stays pan/zoom
  // interactive) but only when a map screen is focused; the navigator's own
  // screens sit underneath. Map-first screens render nothing in the navigator
  // (their UI is teleported into the overlay outlet), so give this subtree a
  // transparent-background theme and let opaque screens paint their own bodies.
  const navTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: { ...base.colors, background: 'transparent', card: 'transparent' },
    };
  }, [scheme]);

  return (
    <MapSceneProvider>
      <TabBarProvider>
        <View style={[styles.root, { backgroundColor: colors.background }]}>
          <ThemeProvider value={navTheme}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: 'transparent' },
                // Cross-fade opaque screens over the stable shared map instead of
                // sliding them across it.
                animation: 'fade',
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="profile" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="tours" />
              <Stack.Screen name="people" />
              <Stack.Screen name="venues" />
              <Stack.Screen name="acts" />
            </Stack>
          </ThemeProvider>
          <MapStage />
          <MapOverlayOutlet />
          <FloatingTabBar />
        </View>
      </TabBarProvider>
    </MapSceneProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
