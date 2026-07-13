import { StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, type ThemeColors } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

type Props = ViewProps & {
  padded?: boolean;
};

export function Screen({ style, padded = true, children, ...rest }: Props) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
        padded && styles.padded,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    padded: {
      paddingHorizontal: spacing.md,
    },
  });
