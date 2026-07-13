import type { TextStyle, ViewStyle } from 'react-native';

// ---------------------------------------------------------------------------
// Color palettes
//
// Colors are defined as two full palettes (light + dark) keyed by *semantic*
// roles rather than raw values, so components ask for intent ("surface",
// "textSecondary") and the active theme resolves it. The legacy `colors` export
// (below) aliases the light palette so existing screens keep working while we
// migrate them onto the `useTheme()`/`useColors()` hook.
// ---------------------------------------------------------------------------

export type ColorScheme = 'light' | 'dark';

export type ThemeColors = {
  // Backgrounds & surfaces (increasing elevation)
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceElevated: string;
  // Borders / dividers
  border: string;
  borderStrong: string;
  // Text
  text: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  // Brand / accents
  primary: string;
  primaryMuted: string;
  onPrimary: string;
  accent: string;
  // Status
  success: string;
  warning: string;
  danger: string;
  dangerMuted: string;
  // Chrome
  tabBar: string;
  tabBarBorder: string;
  overlay: string;
};

export const lightColors: ThemeColors = {
  background: '#FFFFFF',
  surface: '#F4F4F5',
  surfaceMuted: '#FAFAFA',
  surfaceElevated: '#FFFFFF',
  border: '#E4E4E7',
  borderStrong: '#D4D4D8',
  text: '#18181B',
  textSecondary: '#3F3F46',
  textMuted: '#71717A',
  textInverse: '#FFFFFF',
  primary: '#2563EB',
  primaryMuted: '#EFF6FF',
  onPrimary: '#FFFFFF',
  accent: '#7C3AED',
  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
  dangerMuted: '#FEF2F2',
  tabBar: '#FFFFFF',
  tabBarBorder: '#E4E4E7',
  overlay: 'rgba(0, 0, 0, 0.25)',
};

export const darkColors: ThemeColors = {
  background: '#0B0B0F',
  surface: '#17171C',
  surfaceMuted: '#111116',
  surfaceElevated: '#1F1F27',
  border: '#2A2A32',
  borderStrong: '#3A3A44',
  text: '#FAFAFA',
  textSecondary: '#D4D4D8',
  textMuted: '#8E8E98',
  textInverse: '#18181B',
  primary: '#3B82F6',
  primaryMuted: '#12233F',
  onPrimary: '#FFFFFF',
  accent: '#A78BFA',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  dangerMuted: '#2A1517',
  tabBar: '#111116',
  tabBarBorder: '#2A2A32',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const palettes: Record<ColorScheme, ThemeColors> = {
  light: lightColors,
  dark: darkColors,
};

// ---------------------------------------------------------------------------
// Spacing, radius, elevation
// ---------------------------------------------------------------------------

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} satisfies Record<string, number>;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 999,
} satisfies Record<string, number>;

// Shadow presets. iOS reads shadow*, Android reads elevation; we set both so a
// card looks consistent cross-platform. Shadow color stays dark on both themes.
export const elevation = {
  none: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  sm: {
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  md: {
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  lg: {
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
} satisfies Record<string, ViewStyle>;

export type ElevationToken = keyof typeof elevation;

// ---------------------------------------------------------------------------
// Typography scale (size + weight + line height)
// ---------------------------------------------------------------------------

export const typography = {
  display: { fontSize: 34, fontWeight: '800', lineHeight: 40 },
  title: { fontSize: 28, fontWeight: '700', lineHeight: 34 },
  heading: { fontSize: 20, fontWeight: '600', lineHeight: 26 },
  subheading: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 22 },
  callout: { fontSize: 15, fontWeight: '500', lineHeight: 20 },
  caption: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
} satisfies Record<string, TextStyle>;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} satisfies Record<string, TextStyle['fontWeight']>;

export type FontWeightToken = keyof typeof fontWeight;

// ---------------------------------------------------------------------------
// Theme object + legacy exports
// ---------------------------------------------------------------------------

export type Theme = {
  scheme: ColorScheme;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  elevation: typeof elevation;
  typography: typeof typography;
};

export function buildTheme(scheme: ColorScheme): Theme {
  return {
    scheme,
    colors: palettes[scheme],
    spacing,
    radius,
    elevation,
    typography,
  };
}

// Legacy default export used by screens not yet migrated to useTheme(). Always
// the light palette so unmigrated screens keep their current appearance.
export const colors = lightColors;

export type ColorToken = keyof ThemeColors;
export type TypographyVariant = keyof typeof typography;
