import { BlurView } from 'expo-blur';
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { ProfileMenuButton } from '@/components/ProfileMenu';
import { Text } from '@/components/Text';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';

type Props = {
  title: string;
  /** 0 = sheet collapsed, 1 = sheet expanded. Drives the compress/fade. */
  progress: SharedValue<number>;
  topInset: number;
  years: number[];
  selectedYear: number | null;
  onSelectYear: (year: number | null) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
};

/**
 * The floating chrome over the map: title, profile, and the time filter. It's
 * translucent (blurred) and, like Apple Maps, its secondary row gently fades and
 * lifts as the sheet rises so the map reads as the primary layer. (The
 * Places/Routes toggle lives on the map itself, above the sheet.)
 */
export function LifetimeHeader({
  title,
  progress,
  topInset,
  years,
  selectedYear,
  onSelectYear,
  onLayout,
}: Props) {
  const styles = useThemedStyles(createStyles);
  const { scheme } = useTheme();

  // Secondary controls compress away as the sheet takes over the screen.
  const secondaryStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.45, 0.85], [1, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(progress.value, [0.45, 0.85], [0, -10], Extrapolation.CLAMP) },
    ],
  }));

  // The whole bar dims slightly at full expansion but never fully disappears.
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.85, 1], [1, 0.6], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View
      style={[styles.container, { paddingTop: topInset + spacing.sm }, barStyle]}
      pointerEvents="box-none"
      onLayout={onLayout}
    >
      <BlurView
        intensity={scheme === 'dark' ? 30 : 45}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.tint} pointerEvents="none" />

      <View style={styles.titleRow} pointerEvents="box-none">
        <View style={styles.titleWrap}>
          <Text variant="caption" color="textMuted" style={styles.kicker}>
            ON THE ROAD
          </Text>
          <Text variant="title">{title}</Text>
        </View>
        <ProfileMenuButton />
      </View>

      {years.length > 0 && (
        <Animated.View style={secondaryStyle} pointerEvents="box-none">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            <FilterPill
              label="All time"
              active={selectedYear == null}
              onPress={() => onSelectYear(null)}
            />
            {years.map((year) => (
              <FilterPill
                key={year}
                label={String(year)}
                active={selectedYear === year}
                onPress={() => onSelectYear(year)}
              />
            ))}
          </ScrollView>
        </Animated.View>
      )}
    </Animated.View>
  );
}

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.pill, active && styles.pillActive]}
    >
      <Text
        variant="caption"
        color={active ? 'onPrimary' : 'textSecondary'}
        style={styles.pillLabel}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomLeftRadius: radius.lg,
      borderBottomRightRadius: radius.lg,
      overflow: 'hidden',
      gap: spacing.sm,
    },
    tint: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.background,
      opacity: 0.55,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    titleWrap: {
      flex: 1,
    },
    kicker: {
      letterSpacing: 1.5,
    },
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: 2,
      paddingRight: spacing.md,
    },
    pill: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    pillLabel: {
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
  });
