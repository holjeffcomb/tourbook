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

// Light theme: warm "cream" surfaces with a faded slate-blue for brand/text and
// a caramel accent. Intentionally soft and low-contrast (vanilla-esque) for now.
export const lightColors: ThemeColors = {
  background: '#F6F1E7',
  surface: '#FBF7EF',
  surfaceMuted: '#EFE9DB',
  surfaceElevated: '#FFFFFF',
  border: '#E4DAC8',
  borderStrong: '#D3C7B1',
  text: '#2C333D',
  textSecondary: '#4C5560',
  textMuted: '#7C766B',
  textInverse: '#FBF7EF',
  primary: '#3E6B8A',
  primaryMuted: '#E7EDF0',
  onPrimary: '#FFFFFF',
  accent: '#B0855C',
  success: '#4E8A5C',
  warning: '#BE8A3C',
  danger: '#B44A44',
  dangerMuted: '#F4E7E4',
  tabBar: '#FBF7EF',
  tabBarBorder: '#E4DAC8',
  overlay: 'rgba(44, 51, 61, 0.28)',
};

// Dark theme: a faded blue/grey (slate), not pure black, to match the light
// theme's muted character.
export const darkColors: ThemeColors = {
  background: '#2B303B',
  surface: '#333945',
  surfaceMuted: '#252A33',
  surfaceElevated: '#3B4350',
  border: '#414A57',
  borderStrong: '#525C6B',
  text: '#ECEFF4',
  textSecondary: '#C3CAD5',
  textMuted: '#8C94A1',
  textInverse: '#2C333D',
  primary: '#7FA6C4',
  primaryMuted: '#2E3A47',
  onPrimary: '#0F141A',
  accent: '#C9A98C',
  success: '#7FB588',
  warning: '#D6A85E',
  danger: '#D98A80',
  dangerMuted: '#3A2B29',
  tabBar: '#252A33',
  tabBarBorder: '#414A57',
  overlay: 'rgba(0, 0, 0, 0.5)',
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

// Slightly condensed vs. stock iOS sizes — readable on phone, denser on map
// sheets where stats and lists compete with the map for vertical space.
export const typography = {
  display: { fontSize: 30, fontWeight: '800', lineHeight: 36 },
  title: { fontSize: 24, fontWeight: '700', lineHeight: 30 },
  heading: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  subheading: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 20 },
  callout: { fontSize: 14, fontWeight: '500', lineHeight: 18 },
  caption: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
  label: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
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
