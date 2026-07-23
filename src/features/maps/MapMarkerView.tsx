import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';
import type { SceneMarker } from './mapScene';

/**
 * Custom themed pin for the non-stop markers (you / them / venue). Numbered
 * tour stops are drawn as data-driven map layers instead (see MapStage), so
 * their numbers always sit above the route line.
 */
export function MarkerView({ marker }: { marker: SceneMarker }) {
  const styles = useThemedStyles(createStyles);
  const { kind, label } = marker;
  if (kind === 'venue') {
    return (
      <View style={styles.venueMarkerOuter}>
        <View style={styles.venueMarkerInner} />
      </View>
    );
  }
  return (
    <View style={[styles.pin, kind === 'you' ? styles.pinYou : styles.pinThem]}>
      <Text variant="caption" style={styles.pinText}>
        {label ?? (kind === 'you' ? 'You' : 'Them')}
      </Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    pin: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radius.sm,
    },
    pinYou: {
      backgroundColor: colors.primary,
    },
    pinThem: {
      backgroundColor: colors.text,
    },
    pinText: {
      color: '#fff',
    },
    venueMarkerOuter: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.onPrimary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.primary,
    },
    venueMarkerInner: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
  });
