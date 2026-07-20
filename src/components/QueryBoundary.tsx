import { type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { spacing } from '@/theme';
import { useColors } from '@/theme/ThemeProvider';

type Props = {
  isLoading: boolean;
  isError: boolean;
  /** Copy shown in the error state. */
  errorMessage: string;
  /** When provided, a "Retry" button is shown in the error state. */
  onRetry?: () => void;
  /**
   * Container for the loading/error states, so each screen keeps its own layout
   * (some use a full-height centered box, others an inline section).
   */
  containerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * Renders the shared loading and error states for a query, then its children
 * once the query has settled. Empty states stay with the caller — their copy
 * and calls-to-action vary per screen. The loading/error markup mirrors what
 * screens previously inlined, so adopting this does not change appearance.
 */
export function QueryBoundary({
  isLoading,
  isError,
  errorMessage,
  onRetry,
  containerStyle,
  children,
}: Props) {
  const colors = useColors();

  if (isLoading) {
    return (
      <View style={containerStyle ?? styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={containerStyle ?? styles.center}>
        <Text color="danger">{errorMessage}</Text>
        {onRetry && <Button title="Retry" variant="secondary" onPress={onRetry} />}
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
