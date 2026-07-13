import Ionicons from '@react-native-vector-icons/ionicons';
import type { ComponentProps } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import type { ColorToken } from '@/theme';
import { useColors } from '@/theme/ThemeProvider';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  name: IconName;
  size?: number;
  // A semantic color token (resolved from the active theme) or a raw color string.
  color?: ColorToken | (string & {});
  style?: StyleProp<TextStyle>;
};

export function Icon({ name, size = 24, color = 'text', style }: Props) {
  const colors = useColors();
  const resolved = color in colors ? colors[color as ColorToken] : (color as string);
  return <Ionicons name={name} size={size} color={resolved} style={style} />;
}
