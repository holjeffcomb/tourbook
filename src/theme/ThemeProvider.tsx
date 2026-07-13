import {
  createContext,
  use,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';
import { buildTheme, type ColorScheme, type Theme, type ThemeColors } from '@/theme';

/** 'system' follows the OS setting; 'light'/'dark' force a scheme. */
export type ThemePreference = ColorScheme | 'system';

type ThemeContextValue = {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Default preference is forced light for now. Screens still read the legacy
// static `colors` (light) export; once they're migrated onto useTheme()/useColors(),
// switch the default to 'system' to enable dark mode app-wide.
const DEFAULT_PREFERENCE: ThemePreference = 'light';

export function ThemeProvider({
  children,
  initialPreference = DEFAULT_PREFERENCE,
}: PropsWithChildren<{ initialPreference?: ThemePreference }>) {
  const systemScheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);

  const value = useMemo<ThemeContextValue>(() => {
    const scheme: ColorScheme = preference === 'system' ? systemScheme : preference;
    return { theme: buildTheme(scheme), preference, setPreference };
  }, [preference, systemScheme]);

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
