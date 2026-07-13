import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import {
  fontWeight as fontWeights,
  typography,
  type ColorToken,
  type FontWeightToken,
  type TypographyVariant,
} from '@/theme';
import { useColors } from '@/theme/ThemeProvider';

type Props = RNTextProps & {
  variant?: TypographyVariant;
  color?: ColorToken;
  weight?: FontWeightToken;
  align?: TextStyle['textAlign'];
};

export function Text({
  variant = 'body',
  color = 'text',
  weight,
  align,
  style,
  ...rest
}: Props) {
  const colors = useColors();
  return (
    <RNText
      style={[
        typography[variant],
        { color: colors[color] },
        weight ? { fontWeight: fontWeights[weight] } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    />
  );
}
