import { BlurView } from 'expo-blur';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { Text } from '@/components/Text';
import type { MapPlace } from '@/features/maps/mapScene';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';

type Props = {
  place: MapPlace;
  top: number;
  onClose: () => void;
};

function formatVisitDate(date: string | null | undefined): string | null {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTourNames(names: string[] | undefined, tourCount: number | undefined): string | null {
  if (!names?.length) {
    if (tourCount == null || tourCount <= 0) return null;
    return `${tourCount} tour${tourCount === 1 ? '' : 's'}`;
  }
  const unique = [...new Set(names)];
  if (unique.length <= 2) return unique.join(' · ');
  return `${unique.slice(0, 2).join(' · ')} +${unique.length - 2} more`;
}

/**
 * Floating inspect card for a Lifetime map place — sits in the overlay above
 * the map so it isn't buried under the stats sheet. Enters with a soft drop
 * reveal so the tap → card moment feels immediate and physical.
 */
export function PlaceDetailCard({ place, top, onClose }: Props) {
  const styles = useThemedStyles(createStyles);
  const { scheme } = useTheme();
  const title = place.label || place.city || 'Place';
  const subtitle = place.city && place.label && place.label !== place.city ? place.city : null;
  const toursLine = formatTourNames(place.tourNames, place.tourCount);
  const first = formatVisitDate(place.firstVisit);
  const last = formatVisitDate(place.lastVisit);
  const dateLine = first && last && first !== last ? `${first} → ${last}` : last || first;

  return (
    <Animated.View
      entering={FadeInDown.duration(150)}
      exiting={FadeOut.duration(90)}
      style={[styles.card, { top }]}
      pointerEvents="box-none"
    >
      <BlurView
        intensity={scheme === 'dark' ? 40 : 60}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.tint} pointerEvents="none" />
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text style={styles.kicker}>PLACE</Text>
          <Text variant="heading" numberOfLines={1}>
            {title}
          </Text>
          {!!subtitle && (
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close place details"
          style={styles.close}
        >
          <Text variant="body" color="textMuted">
            ✕
          </Text>
        </Pressable>
      </View>
      <View style={styles.stats}>
        <Stat value={String(place.weight ?? 1)} label={`visit${(place.weight ?? 1) === 1 ? '' : 's'}`} />
        {place.tourCount != null && (
          <Stat value={String(place.tourCount)} label={`tour${place.tourCount === 1 ? '' : 's'}`} />
        )}
        {!!dateLine && <Stat value={dateLine} label="on the road" wide />}
      </View>
      {!!toursLine && (
        <Text variant="caption" color="textMuted" numberOfLines={2} style={styles.tours}>
          {toursLine}
        </Text>
      )}
    </Animated.View>
  );
}

function Stat({ value, label, wide }: { value: string; label: string; wide?: boolean }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.stat, wide && styles.statWide]}>
      <Text variant="body" style={styles.statValue}>
        {value}
      </Text>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      overflow: 'hidden',
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.sm,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    tint: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      opacity: 0.75,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    titleWrap: {
      flex: 1,
      gap: 2,
    },
    kicker: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1.3,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    close: {
      minWidth: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stats: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.lg,
    },
    stat: {
      gap: 2,
    },
    statWide: {
      flexShrink: 1,
    },
    statValue: {
      fontWeight: '700',
    },
    tours: {
      paddingTop: 2,
    },
  });
