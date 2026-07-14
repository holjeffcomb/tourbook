import {
  Text as RNText,
  StyleSheet,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';
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

  // Guard against clipping: our type scale sets a fixed lineHeight per variant.
  // If a caller overrides fontSize (e.g. a large hero number) without also
  // setting lineHeight, the inherited lineHeight would clip the glyphs. In that
  // case clear lineHeight so React Native auto-sizes it to the new fontSize.
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const clearLineHeight = flat?.fontSize != null && flat.lineHeight == null;

  return (
    <RNText
      style={[
        typography[variant],
        { color: colors[color] },
        weight ? { fontWeight: fontWeights[weight] } : null,
        align ? { textAlign: align } : null,
        style,
        clearLineHeight ? { lineHeight: undefined } : null,
      ]}
      {...rest}
    />
  );
}
