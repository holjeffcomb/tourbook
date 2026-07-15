import { Fragment } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AnimatedCount } from '@/components/AnimatedCount';
import { Text } from '@/components/Text';
import type { HighlightGroup, PassportHighlight, PassportStats } from '@/features/stats/types';
import {
  EARTH_CIRCUMFERENCE_MILES,
  formatPercent,
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
 * The Lifetime stats body — a stack of Flighty-style cards. A distance hero
 * frames total mileage against cosmic yardsticks (Earth / Moon / Sun), a compact
 * overview grid holds the headline counts, and the fun facts are grouped into
 * labelled cards. Uppercase, letter-spaced kickers set the typographic theme.
 * All numbers roll when the year/filter changes.
 */
export function StatsContent({ stats, bottomInset, onPressPerson }: Props) {
  const styles = useThemedStyles(createStyles);

  const distances = [
    { label: 'Around Earth', value: formatTripFraction(stats.totalMiles, EARTH_CIRCUMFERENCE_MILES) },
    { label: 'To the Moon', value: formatTripFraction(stats.totalMiles, MOON_DISTANCE_MILES) },
    { label: 'To the Sun', value: formatTripFraction(stats.totalMiles, SUN_DISTANCE_MILES) },
  ];

  const cells: { label: string; value: number; note?: string }[] = [
    { label: 'Tours', value: stats.tourCount },
    { label: 'Shows', value: stats.totalShows },
    { label: 'Days on road', value: stats.daysOnRoad },
    { label: 'Cities', value: stats.uniqueCities },
    { label: 'Venues', value: stats.uniqueVenues },
    {
      label: 'Countries',
      value: stats.uniqueCountries,
      note: stats.uniqueCountries > 0 ? `${formatPercent(stats.countryPercent)} of world` : undefined,
    },
  ];
  if (stats.uniqueActs > 1) cells.push({ label: 'Artists', value: stats.uniqueActs });

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
      {/* Distance hero */}
      <View style={styles.card}>
        <Text style={[styles.kicker, styles.center]}>Miles traveled</Text>
        <AnimatedCount
          value={stats.totalMiles}
          suffix=" mi"
          variant="display"
          style={styles.heroValue}
        />
        <View style={styles.divider} />
        <View style={styles.compareRow}>
          {distances.map((d) => (
            <View key={d.label} style={styles.compareCell}>
              <Text style={styles.compareValue}>{d.value}</Text>
              <Text style={[styles.kicker, styles.center]} numberOfLines={2}>
                {d.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Overview grid */}
      <View style={styles.card}>
        <Text style={styles.kicker}>Overview</Text>
        <View style={styles.grid}>
          {cells.map((cell) => (
            <View key={cell.label} style={styles.cell}>
              <AnimatedCount value={cell.value} variant="title" style={styles.cellValue} />
              <Text style={styles.cellLabel} numberOfLines={2}>
                {cell.label}
              </Text>
              {!!cell.note && (
                <Text variant="caption" color="textMuted" style={styles.center} numberOfLines={1}>
                  {cell.note}
                </Text>
              )}
            </View>
          ))}
        </View>
      </View>

      {/* Grouped highlight cards */}
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
      <Text variant="callout" color="textMuted" style={styles.rowLabel} numberOfLines={2}>
        {item.label}
      </Text>
      <View style={styles.rowRight}>
        <Text
          variant="subheading"
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
      paddingTop: spacing.sm,
      gap: spacing.md,
    },
    card: {
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    // The shared typographic theme: small, uppercase, letter-spaced kicker.
    kicker: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1.3,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    center: {
      textAlign: 'center',
    },
    heroValue: {
      fontSize: 40,
      textAlign: 'center',
      color: colors.text,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: spacing.xs,
    },
    compareRow: {
      flexDirection: 'row',
    },
    compareCell: {
      flex: 1,
      alignItems: 'center',
      gap: spacing.xxs,
      paddingHorizontal: spacing.xs,
    },
    compareValue: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.primary,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    cell: {
      width: '33.33%',
      alignItems: 'center',
      gap: 2,
      paddingVertical: spacing.sm,
    },
    cellValue: {
      fontSize: 24,
      color: colors.text,
    },
    cellLabel: {
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      textAlign: 'center',
      color: colors.textMuted,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: spacing.sm,
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
