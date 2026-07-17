import { Fragment } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AnimatedCount } from '@/components/AnimatedCount';
import { Text } from '@/components/Text';
import type { HighlightGroup, PassportHighlight, PassportStats } from '@/features/stats/types';
import {
  EARTH_CIRCUMFERENCE_MILES,
  formatTripFraction,
  MOON_DISTANCE_MILES,
  SUN_DISTANCE_MILES,
} from '@/lib/geo';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

type Props = {
  stats: PassportStats;
  bottomInset: number;
  onPressPerson: (userId: string) => void;
};

const GROUP_ORDER: HighlightGroup[] = ['time', 'places', 'people', 'road'];
const GROUP_TITLE: Record<HighlightGroup, string> = {
  time: 'Milestones',
  places: 'Places',
  people: 'Collaborators',
  road: 'On the road',
};

/**
 * Lifetime stats body. The first card is a condensed Flighty-style OVERVIEW
 * sized for the low resting sheet snap (miles + cosmic yardsticks + headline
 * counts). Dragging the sheet up reveals the grouped fun-fact cards below.
 */
export function StatsContent({ stats, bottomInset, onPressPerson }: Props) {
  const styles = useThemedStyles(createStyles);

  const earth = formatTripFraction(stats.totalMiles, EARTH_CIRCUMFERENCE_MILES);
  const moon = formatTripFraction(stats.totalMiles, MOON_DISTANCE_MILES);
  const sun = formatTripFraction(stats.totalMiles, SUN_DISTANCE_MILES);

  const cells: { label: string; value: number }[] = [
    { label: 'Tours', value: stats.tourCount },
    { label: 'Shows', value: stats.totalShows },
    { label: 'Countries', value: stats.uniqueCountries },
    { label: 'Days on road', value: stats.daysOnRoad },
    { label: 'Cities', value: stats.uniqueCities },
  ];

  const groups = GROUP_ORDER.map((group) => ({
    group,
    title: GROUP_TITLE[group],
    items: stats.highlights.filter((h) => h.group === group),
  })).filter((g) => g.items.length > 0);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset + spacing.xl }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.overviewCard}>
        <Text style={styles.kicker}>Overview</Text>

        <View style={styles.distanceBlock}>
          <Text style={styles.statLabel}>Distance</Text>
          <AnimatedCount
            value={stats.totalMiles}
            suffix=" mi"
            variant="title"
            style={styles.milesValue}
          />
          <Text style={styles.cosmicLine} numberOfLines={1}>
            {earth} Earth · {moon} Moon · {sun} Sun
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.grid}>
          {cells.map((cell) => (
            <View key={cell.label} style={styles.cell}>
              <Text style={styles.statLabel}>{cell.label}</Text>
              <AnimatedCount value={cell.value} variant="title" style={styles.cellValue} />
            </View>
          ))}
        </View>
      </View>

      {groups.map((g) => (
        <View key={g.group} style={styles.card}>
          <Text style={styles.kicker}>{g.title}</Text>
          <View>
            {g.items.map((item, index) => (
              <Fragment key={item.label}>
                {index > 0 && <View style={styles.rowDivider} />}
                <HighlightRow item={item} stats={stats} onPressPerson={onPressPerson} />
              </Fragment>
            ))}
          </View>
        </View>
      ))}

      <Text variant="caption" color="textMuted" style={styles.footnote}>
        Distances are straight-line miles between stops with map pins. Country counts are inferred
        from city strings when available.
      </Text>
    </ScrollView>
  );
}

function HighlightRow({
  item,
  stats,
  onPressPerson,
}: {
  item: PassportHighlight;
  stats: PassportStats;
  onPressPerson: (userId: string) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const tappable = item.label === 'Most toured with' && !!stats.mostTouredWith?.userId;

  return (
    <View style={styles.row}>
      <Text variant="caption" color="textMuted" style={styles.rowLabel} numberOfLines={2}>
        {item.label}
      </Text>
      <View style={styles.rowRight}>
        <Text
          variant="callout"
          weight="semibold"
          color={tappable ? 'primary' : 'text'}
          align="right"
          onPress={tappable ? () => onPressPerson(stats.mostTouredWith!.userId) : undefined}
        >
          {item.value}
        </Text>
        {!!item.detail && (
          <Text variant="caption" color="textMuted" align="right" numberOfLines={1}>
            {item.detail}
          </Text>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: {
      flex: 1,
    },
    content: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
      gap: spacing.md,
    },
    overviewCard: {
      paddingHorizontal: spacing.sm + 4,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm + 4,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    card: {
      paddingHorizontal: spacing.sm + 4,
      paddingVertical: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.xs,
    },
    kicker: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    distanceBlock: {
      gap: 1,
    },
    statLabel: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1.0,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    milesValue: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.4,
    },
    cosmicLine: {
      marginTop: 1,
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: spacing.xxs,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      rowGap: spacing.sm,
    },
    cell: {
      width: '33.33%',
      gap: 1,
      paddingRight: spacing.xs,
    },
    cellValue: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.3,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: spacing.xs + 2,
    },
    rowLabel: {
      flex: 1,
    },
    rowRight: {
      alignItems: 'flex-end',
      gap: 1,
      flexShrink: 1,
    },
    rowDivider: {
      height: 1,
      backgroundColor: colors.border,
    },
    footnote: {
      textAlign: 'center',
      paddingTop: spacing.xs,
    },
  });
