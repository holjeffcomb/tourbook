import { BlurView } from 'expo-blur';
import { useRouter, useSegments } from 'expo-router';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { useUpcomingCrossedPaths } from '@/features/social/useUpcomingCrossedPaths';
import { radius, type ThemeColors } from '@/theme';
import { useColors, useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { TAB_BAR_HEIGHT } from './mapScene';

// ---------------------------------------------------------------------------
// Floating tab bar
//
// The shared map renders on top of the navigator, which would bury the native
// bottom tab bar underneath it. Instead the Tabs navigator hands its state to
// this module via `TabBarBridge` (rendered as its `tabBar`, drawing nothing),
// and `FloatingTabBar` re-draws the bar in the app-level overlay *above* the
// map. This keeps the tab bar visible and tappable while the map stays the
// full-bleed background.
// ---------------------------------------------------------------------------

type TabRoute = { key: string; name: string };

type TabIcon = (p: { focused: boolean; color: string; size: number }) => ReactNode;

export type TabBarProps = {
  state: { index: number; routes: TabRoute[] };
  descriptors: Record<string, { options: { title?: string; tabBarIcon?: TabIcon } }>;
  navigation: { navigate: (name: string) => void };
};

type Controls = {
  setProps: (p: TabBarProps | null) => void;
  propsRef: { current: TabBarProps | null };
};

const ControlsContext = createContext<Controls | null>(null);
// Bumped only when the active tab index changes, so the bar re-renders on tab
// switches without looping on every navigator render.
const VersionContext = createContext(0);

export function TabBarProvider({ children }: { children: ReactNode }) {
  const propsRef = useRef<TabBarProps | null>(null);
  const lastIndex = useRef(-2);
  const [version, setVersion] = useState(0);

  const setProps = useCallback((p: TabBarProps | null) => {
    propsRef.current = p;
    const idx = p ? p.state.index : -1;
    if (idx !== lastIndex.current) {
      lastIndex.current = idx;
      setVersion((v) => v + 1);
    }
  }, []);

  const controls = useMemo<Controls>(() => ({ setProps, propsRef }), [setProps]);

  return (
    <ControlsContext.Provider value={controls}>
      <VersionContext.Provider value={version}>{children}</VersionContext.Provider>
    </ControlsContext.Provider>
  );
}

/** Rendered as the Tabs navigator's `tabBar`; draws nothing, just relays state. */
export function TabBarBridge(props: TabBarProps) {
  const controls = use(ControlsContext);
  useEffect(() => {
    controls?.setProps(props);
  });
  useEffect(() => () => controls?.setProps(null), [controls]);
  return null;
}

export function FloatingTabBar() {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const { scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const segments = useSegments();
  const controls = use(ControlsContext);
  const version = use(VersionContext);
  // Surfaces an upcoming-path-crossing badge on the Friends' Tours tab.
  const { count: crossedCount } = useUpcomingCrossedPaths();

  // Only show over the tab screens — not over pushed detail / form screens.
  const onTabs = (segments as string[]).includes('(tabs)');
  const props = useMemo(() => controls?.propsRef.current ?? null, [controls, version]);

  if (!onTabs || !props) return null;

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]} pointerEvents="box-none">
      <BlurView
        intensity={scheme === 'dark' ? 40 : 60}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.tint} pointerEvents="none" />
      <View style={styles.row}>
        {props.state.routes.map((route, i) => {
          const options = props.descriptors[route.key]?.options ?? {};
          const focused = props.state.index === i;

          if (route.name === 'add') {
            return (
              <Pressable
                key={route.key}
                onPress={() => router.push('/tours/new')}
                accessibilityRole="button"
                accessibilityLabel="Add tour"
                style={styles.tab}
              >
                <View style={[styles.addCircle, { backgroundColor: colors.primary }]}>
                  <Icon name="add" size={28} color="onPrimary" />
                </View>
              </Pressable>
            );
          }

          const color = focused ? colors.primary : colors.textMuted;
          const badge = route.name === 'friends-tours' && crossedCount > 0 ? crossedCount : 0;
          return (
            <Pressable
              key={route.key}
              onPress={() => {
                if (!focused) props.navigation.navigate(route.name);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={
                badge > 0
                  ? `${options.title ?? route.name}, ${badge} upcoming crossed paths`
                  : (options.title ?? route.name)
              }
              style={styles.tab}
            >
              <View style={styles.iconWrap}>
                {options.tabBarIcon?.({ focused, color, size: 24 })}
                {badge > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText} numberOfLines={1}>
                      {badge > 9 ? '9+' : badge}
                    </Text>
                  </View>
                )}
              </View>
              <Text variant="caption" style={[styles.label, { color }]} numberOfLines={1}>
                {options.title ?? route.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      overflow: 'hidden',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.tabBarBorder,
    },
    tint: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.tabBar,
      opacity: 0.86,
    },
    row: {
      height: TAB_BAR_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      // Keep the icons clear of the top hairline border.
      paddingTop: 8,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    iconWrap: {
      position: 'relative',
    },
    badge: {
      position: 'absolute',
      top: -5,
      right: -11,
      minWidth: 16,
      height: 16,
      paddingHorizontal: 4,
      borderRadius: radius.full,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.tabBar,
    },
    badgeText: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '700',
      lineHeight: 13,
    },
    label: {
      fontSize: 11,
    },
    addCircle: {
      width: 48,
      height: 48,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      top: -4,
    },
  });
