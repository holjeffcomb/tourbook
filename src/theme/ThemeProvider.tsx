import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import {
  buildTheme,
  type ColorScheme,
  type Theme,
  type ThemeColors,
} from '@/theme';

/** 'system' follows the OS setting; 'light'/'dark' force a scheme. */
export type ThemePreference = ColorScheme | 'system';

type ThemeContextValue = {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'tourbook-theme-preference';
const DEFAULT_PREFERENCE: ThemePreference = 'system';

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function ThemeProvider({
  children,
  initialPreference = DEFAULT_PREFERENCE,
}: PropsWithChildren<{ initialPreference?: ThemePreference }>) {
  const systemScheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);

  // Load the persisted preference once on mount.
  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (isPreference(stored)) setPreferenceState(stored);
    });
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const scheme: ColorScheme = preference === 'system' ? systemScheme : preference;
    return { theme: buildTheme(scheme), preference, setPreference };
  }, [preference, systemScheme, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const value = use(ThemeContext);
  if (!value) throw new Error('useTheme must be used within a <ThemeProvider>');
  return value.theme;
}

export function useColors(): ThemeColors {
  return useTheme().colors;
}

export function useThemePreference() {
  const value = use(ThemeContext);
  if (!value) throw new Error('useThemePreference must be used within a <ThemeProvider>');
  return { preference: value.preference, setPreference: value.setPreference };
}

/**
 * Builds a memoized StyleSheet from the active theme. Screens define a
 * `createStyles(colors)` factory (module scope) and call
 * `const styles = useThemedStyles(createStyles)` so their colors update when the
 * theme changes, while layout values stay static.
 */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (colors: ThemeColors, theme: Theme) => T,
): T {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(factory(theme.colors, theme)), [factory, theme]);
}
