import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { computeTourStats } from '@/features/stats/compute';
import type { TourStop } from '@/features/shows/api';
import { formatEarthLaps, formatMiles } from '@/lib/geo';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

type Props = {
  stops: TourStop[];
};

/** Compact mile figure for the tight overview grid ("1.2k", "840"). */
function compactMiles(miles: number): string {
  if (miles <= 0) return '0';
  if (miles >= 1000) return `${(miles / 1000).toFixed(1)}k`;
  return String(Math.round(miles));
}

/**
 * Tour stats as two condensed, Flighty-style cards: a headline overview grid and
 * a set of "on the road" highlight rows (legs, pace, reach). Shares the uppercase
 * kicker + surface-card language used on the Lifetime page.
 */
export function TourStatsSection({ stops }: Props) {
  const styles = useThemedStyles(createStyles);
  if (stops.length === 0) return null;

  const stats = computeTourStats(stops);
  const hasDistance = stats.totalMiles > 0;

  const cells: { label: string; value: string }[] = [
    { label: 'Shows', value: String(stats.showCount) },
    { label: 'Off days', value: String(stats.offDays) },
    { label: 'Days', value: String(stats.calendarDays) },
    { label: 'Cities', value: String(stats.uniqueCities) },
    { label: 'Venues', value: String(stats.uniqueVenues) },
    { label: 'Miles', value: hasDistance ? compactMiles(stats.totalMiles) : '—' },
  ];

  const highlights: { label: string; value: string; detail?: string }[] = [];

  if (stats.showCount > 0 && stats.calendarDays >= 7) {
    const perWeek = (stats.showCount * 7) / stats.calendarDays;
    highlights.push({
      label: 'Show pace',
      value: `${perWeek.toFixed(1)}/wk`,
      detail: `${stats.showCount} shows · ${stats.calendarDays} days`,
    });
  }
  if (stats.longestDrive) {
    highlights.push({
      label: 'Longest leg',
      value: formatMiles(stats.longestDrive.miles),
      detail: `${stats.longestDrive.fromLabel} → ${stats.longestDrive.toLabel}`,
    });
  }
  if (hasDistance && stats.segmentCount > 0) {
    highlights.push({
      label: 'Average leg',
      value: formatMiles(stats.avgDriveMiles),
      detail:
        stats.unlocatedStops > 0
          ? `${stats.segmentCount} legs · ${stats.unlocatedStops} without a pin`
          : `${stats.segmentCount} legs`,
    });
  }
  if (stats.shortestDrive && stats.segmentCount > 1) {
    highlights.push({
      label: 'Shortest leg',
      value: formatMiles(stats.shortestDrive.miles),
      detail: `${stats.shortestDrive.fromLabel} → ${stats.shortestDrive.toLabel}`,
    });
  }
  if (stats.countries.length > 0) {
    highlights.push({
      label: stats.countries.length === 1 ? 'Country' : 'Countries',
      value: String(stats.countries.length),
      detail: stats.countries.join(', '),
    });
  }
  if (hasDistance) {
    highlights.push({
      label: 'Around the Earth',
      value: formatEarthLaps(stats.totalMiles),
      detail: 'of the equator traveled',
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.kicker}>Tour overview</Text>
        <View style={styles.grid}>
          {cells.map((cell) => (
            <View key={cell.label} style={styles.cell}>
              <Text style={styles.cellValue}>{cell.value}</Text>
              <Text style={styles.cellLabel} numberOfLines={1}>
                {cell.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {highlights.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.kicker}>On the road</Text>
          <View>
            {highlights.map((h, index) => (
              <Fragment key={h.label}>
                {index > 0 && <View style={styles.rowDivider} />}
                <View style={styles.row}>
                  <Text variant="callout" color="textMuted" style={styles.rowLabel} numberOfLines={2}>
                    {h.label}
                  </Text>
                  <View style={styles.rowRight}>
                    <Text variant="subheading" align="right" numberOfLines={1}>
                      {h.value}
                    </Text>
                    {!!h.detail && (
                      <Text variant="caption" color="textMuted" align="right" numberOfLines={1}>
                        {h.detail}
                      </Text>
                    )}
                  </View>
                </View>
              </Fragment>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      gap: spacing.sm,
      paddingBottom: spacing.xs,
    },
    card: {
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    kicker: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1.3,
      textTransform: 'uppercase',
      color: colors.textMuted,
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
      fontWeight: '700',
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
  });
