import { useRouter } from 'expo-router';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/components/Text';
import { spacing } from '@/theme';

type Props = {
  /** Back action. Defaults to `router.back()`. */
  onBack?: () => void;
  /** Link label — "Back" for detail screens, "Cancel" for forms. */
  backLabel?: string;
  /** Optional screen title rendered beneath the back link. */
  title?: string;
  /** Override the default top-bar spacing when a screen needs it. */
  style?: StyleProp<ViewStyle>;
};

/**
 * The standard back/cancel link that opens most non-map screens, with an
 * optional title beneath. Mirrors the `topBar` + title markup screens repeated
 * inline, so adopting it does not change appearance.
 */
export function ScreenHeader({ onBack, backLabel = 'Back', title, style }: Props) {
  const router = useRouter();
  return (
    <>
      <View style={[styles.topBar, style]}>
        <Text variant="body" color="primary" onPress={onBack ?? (() => router.back())}>
          {backLabel}
        </Text>
      </View>
      {!!title && <Text variant="title">{title}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  topBar: {
    paddingTop: spacing.md,
    marginBottom: spacing.sm,
  },
});
