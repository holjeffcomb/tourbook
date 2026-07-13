import { useQueries } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { StatGrid } from '@/components/StatGrid';
import { Text } from '@/components/Text';
import { useAuth } from '@/features/auth/AuthContext';
import { PlacesMap } from '@/features/maps/PlacesMap';
import { listStops } from '@/features/shows/api';
import { showsKey } from '@/features/shows/queries';
import { computePassportStats, computeTourRoutes, computeVisitedPlaces } from '@/features/stats/compute';
import type { TourStop } from '@/features/shows/api';
import { listTourMembers } from '@/features/tours/api';
import { membersKey, useTours } from '@/features/tours/queries';
import { formatEarthLaps, formatMiles, formatPercent } from '@/lib/geo';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors } from '@/theme/ThemeProvider';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function PassportScreen() {
  const colors = useColors();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const toursQuery = useTours();
  const tourIds = toursQuery.data?.map((t) => t.id) ?? [];

  const stopsQueries = useQueries({
    queries: tourIds.map((id) => ({
      queryKey: showsKey(id),
      queryFn: () => listStops(id),
      enabled: !!id,
    })),
  });

  const membersQueries = useQueries({
    queries: tourIds.map((id) => ({
      queryKey: membersKey(id),
      queryFn: () => listTourMembers(id),
      enabled: !!id,
    })),
  });

  const isLoading =
    toursQuery.isLoading ||
    stopsQueries.some((q) => q.isLoading) ||
    membersQueries.some((q) => q.isLoading);

  const isError =
    toursQuery.isError || stopsQueries.some((q) => q.isError) || membersQueries.some((q) => q.isError);

  // null = All-time; otherwise a specific year.
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const stopsByTourIdAll = useMemo(() => {
    const map: Record<string, TourStop[]> = {};
    tourIds.forEach((id, index) => {
      if (stopsQueries[index]?.data) map[id] = stopsQueries[index].data!;
    });
    return map;
  }, [tourIds, stopsQueries]);

  const membersByTourId = useMemo(() => {
    const map: Record<string, Awaited<ReturnType<typeof listTourMembers>>> = {};
    tourIds.forEach((id, index) => {
      if (membersQueries[index]?.data) map[id] = membersQueries[index].data!;
    });
    return map;
  }, [tourIds, membersQueries]);

  // Years present in the data, most recent first, for the switcher.
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const stops of Object.values(stopsByTourIdAll)) {
      for (const s of stops) {
        if (ISO_DATE.test(s.date)) set.add(Number(s.date.slice(0, 4)));
      }
    }
    return [...set].sort((a, b) => b - a);
  }, [stopsByTourIdAll]);

  const { stats, places, routes } = useMemo(() => {
    const filtered: Record<string, TourStop[]> = {};
    for (const [id, stops] of Object.entries(stopsByTourIdAll)) {
      filtered[id] =
        selectedYear == null ? stops : stops.filter((s) => s.date.slice(0, 4) === String(selectedYear));
    }

    // All-time counts every tour; a year counts only tours active that year.
    const tours = (toursQuery.data ?? [])
      .filter((t) => selectedYear == null || (filtered[t.id]?.length ?? 0) > 0)
      .map((t) => ({ id: t.id, actName: t.act.name }));

    return {
      stats: userId
        ? computePassportStats({ userId, tours, stopsByTourId: filtered, membersByTourId })
        : null,
      places: computeVisitedPlaces(filtered).map((p) => ({
        id: p.id,
        latitude: p.latitude,
        longitude: p.longitude,
        weight: p.weight,
        label: p.label,
        city: p.city,
        tourCount: p.tourIds.length,
        lastVisit: p.lastVisit,
      })),
      routes: computeTourRoutes(filtered).map((r) => ({
        id: r.tourId,
        coordinates: r.coordinates,
      })),
    };
  }, [stopsByTourIdAll, membersByTourId, toursQuery.data, userId, selectedYear]);

  const refetchAll = () => {
    toursQuery.refetch();
    stopsQueries.forEach((q) => q.refetch());
    membersQueries.forEach((q) => q.refetch());
  };

  return (
    <Screen>
      <AppHeader title="Lifetime" subtitle="Your lifetime on the road." />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text color="danger">Couldn&apos;t load your stats.</Text>
          <Button title="Retry" variant="secondary" onPress={refetchAll} />
        </View>
      ) : !stats || stats.tourCount === 0 ? (
        <View style={styles.center}>
          <Text variant="heading">No tours yet</Text>
          <Text color="textMuted" style={styles.emptyHint}>
            Join or create a tour to start building your lifetime stats.
          </Text>
        </View>
      ) : (
        <>
          {years.length > 0 && (
            <YearSwitcher
              years={years}
              selected={selectedYear}
              onSelect={setSelectedYear}
              colors={colors}
            />
          )}
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
          >
          {places.length > 0 && (
            <View style={styles.section}>
              <PlacesMap
                key={selectedYear ?? 'all'}
                places={places}
                routes={routes}
                height={320}
              />
              <Text variant="caption" color="textMuted" style={styles.mapCaption}>
                Everywhere you&apos;ve been — bigger dots mean more visits. Switch to Routes to see
                your tours overlaid, hotter where they overlap.
              </Text>
            </View>
          )}

          <Card style={styles.hero}>
            <Text variant="caption" color="textMuted">
              Distance around Earth
            </Text>
            <Text variant="title" style={styles.heroValue}>
              {formatEarthLaps(stats.totalMiles)}
            </Text>
            <Text color="textMuted">{formatMiles(stats.totalMiles)} total traveled</Text>
          </Card>

          <StatGrid
            items={[
              { label: 'Tours', value: String(stats.tourCount) },
              { label: 'Shows', value: String(stats.totalShows) },
              { label: 'Off days', value: String(stats.totalOffDays) },
              { label: 'Cities', value: String(stats.uniqueCities) },
              { label: 'Venues', value: String(stats.uniqueVenues) },
              {
                label: 'Countries',
                value: String(stats.uniqueCountries),
                detail:
                  stats.uniqueCountries > 0
                    ? `${formatPercent(stats.countryPercent)} of the world`
                    : 'Add city + region to stops',
              },
            ]}
          />

          {stats.highlights.length > 0 && (
            <View style={styles.section}>
              <Text variant="heading">Highlights</Text>
              {stats.highlights.map((item) => {
                const isMostToured =
                  item.label === 'Most toured with' && stats.mostTouredWith?.userId;
                return (
                  <Card key={item.label}>
                    <Text variant="caption" color="textMuted">
                      {item.label}
                    </Text>
                    {isMostToured ? (
                      <Text
                        variant="heading"
                        color="primary"
                        onPress={() =>
                          router.push({
                            pathname: '/people/[id]',
                            params: { id: stats.mostTouredWith!.userId },
                          })
                        }
                      >
                        {item.value}
                      </Text>
                    ) : (
                      <Text variant="heading">{item.value}</Text>
                    )}
                    {!!item.detail && <Text color="textMuted">{item.detail}</Text>}
                  </Card>
                );
              })}
            </View>
          )}

          {stats.longestTourMiles > 0 && (
            <Card>
              <Text variant="caption" color="textMuted">
                Longest tour
              </Text>
              <Text variant="heading">{formatMiles(stats.longestTourMiles)}</Text>
            </Card>
          )}

          <Text variant="caption" color="textMuted" style={styles.footnote}>
            Distances are straight-line miles between stops with map pins. Country counts are
            inferred from city strings when available.
          </Text>
          </ScrollView>
        </>
      )}
    </Screen>
  );
}

function YearSwitcher({
  years,
  selected,
  onSelect,
  colors,
}: {
  years: number[];
  selected: number | null;
  onSelect: (year: number | null) => void;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.yearRow}>
      <YearPill label="All time" active={selected == null} onPress={() => onSelect(null)} colors={colors} />
      {years.map((year) => (
        <YearPill
          key={year}
          label={String(year)}
          active={selected === year}
          onPress={() => onSelect(year)}
          colors={colors}
        />
      ))}
    </View>
  );
}

function YearPill({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ThemeColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.yearPill, active && { backgroundColor: colors.primaryMuted }]}
    >
      <Text variant="caption" color={active ? 'primary' : 'textMuted'} style={styles.yearLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  yearRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  yearPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  yearLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  body: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  heroValue: {
    fontSize: 40,
  },
  section: {
    gap: spacing.sm,
  },
  mapCaption: {
    textAlign: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyHint: {
    textAlign: 'center',
  },
  footnote: {
    textAlign: 'center',
    paddingTop: spacing.sm,
  },
});
