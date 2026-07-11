import type { TextStyle } from 'react-native';

export const colors = {
  background: '#FFFFFF',
  surface: '#F4F4F5',
  text: '#18181B',
  textMuted: '#71717A',
  border: '#E4E4E7',
  primary: '#2563EB',
  danger: '#DC2626',
} satisfies Record<string, string>;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} satisfies Record<string, number>;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
} satisfies Record<string, number>;

export const typography = {
  title: { fontSize: 28, fontWeight: '700' },
  heading: { fontSize: 20, fontWeight: '600' },
  body: { fontSize: 16, fontWeight: '400' },
  caption: { fontSize: 13, fontWeight: '400' },
} satisfies Record<string, TextStyle>;

export type ColorToken = keyof typeof colors;
export type TypographyVariant = keyof typeof typography;
