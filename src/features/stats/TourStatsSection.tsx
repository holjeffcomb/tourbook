import { StyleSheet, View } from 'react-native';
import { Card } from '@/components/Card';
import { StatGrid } from '@/components/StatGrid';
import { Text } from '@/components/Text';
import { computeTourStats } from '@/features/stats/compute';
import type { TourStop } from '@/features/shows/api';
import { formatEarthLaps, formatMiles } from '@/lib/geo';
import { spacing } from '@/theme';

type Props = {
  stops: TourStop[];
};

export function TourStatsSection({ stops }: Props) {
  if (stops.length === 0) return null;

  const stats = computeTourStats(stops);
  const hasDistance = stats.totalMiles > 0;

  const items = [
    {
      label: 'Distance traveled',
      value: hasDistance ? formatMiles(stats.totalMiles) : '—',
      detail: hasDistance ? formatEarthLaps(stats.totalMiles) + ' around Earth' : 'Add locations to map miles',
    },
    {
      label: 'Shows & off days',
      value: `${stats.showCount} / ${stats.offDayCount}`,
      detail: stats.showOffLabel,
    },
    {
      label: 'Days on tour',
      value: String(stats.calendarDays),
      detail: `${stats.uniqueCities} ${stats.uniqueCities === 1 ? 'city' : 'cities'}`,
    },
    {
      label: 'Longest leg',
      value: stats.longestDrive ? formatMiles(stats.longestDrive.miles) : '—',
      detail: stats.longestDrive
        ? `${stats.longestDrive.fromLabel} → ${stats.longestDrive.toLabel}`
        : undefined,
    },
    {
      label: 'Shortest leg',
      value: stats.shortestDrive ? formatMiles(stats.shortestDrive.miles) : '—',
      detail: stats.shortestDrive
        ? `${stats.shortestDrive.fromLabel} → ${stats.shortestDrive.toLabel}`
        : undefined,
    },
    {
      label: 'Avg leg',
      value: hasDistance ? formatMiles(stats.avgDriveMiles) : '—',
      detail:
        stats.unlocatedStops > 0
          ? `${stats.unlocatedStops} stop${stats.unlocatedStops === 1 ? '' : 's'} without a pin`
          : `${stats.segmentCount} legs`,
    },
  ];

  if (stats.uniqueVenues > 0) {
    items.push({
      label: 'Unique venues',
      value: String(stats.uniqueVenues),
      detail: stats.countries.length > 0 ? stats.countries.join(', ') : undefined,
    });
  }

  return (
    <View style={styles.container}>
      <Text variant="heading">Tour stats</Text>
      <Card>
        <StatGrid items={items} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
});
