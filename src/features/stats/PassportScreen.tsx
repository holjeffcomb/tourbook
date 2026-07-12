import { useQueries } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { StatGrid } from '@/components/StatGrid';
import { Text } from '@/components/Text';
import { useAuth } from '@/features/auth/AuthContext';
import { listStops } from '@/features/shows/api';
import { showsKey } from '@/features/shows/queries';
import { computePassportStats } from '@/features/stats/compute';
import type { TourStop } from '@/features/shows/api';
import { listTourMembers } from '@/features/tours/api';
import { membersKey, useTours } from '@/features/tours/queries';
import { formatEarthLaps, formatMiles, formatPercent } from '@/lib/geo';
import { colors, spacing } from '@/theme';

export function PassportScreen() {
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

  const stats = useMemo(() => {
    if (!userId || !toursQuery.data) return null;

    const stopsByTourId: Record<string, TourStop[]> = {};
    const membersByTourId: Record<string, Awaited<ReturnType<typeof listTourMembers>>> = {};

    tourIds.forEach((id, index) => {
      if (stopsQueries[index]?.data) stopsByTourId[id] = stopsQueries[index].data!;
      if (membersQueries[index]?.data) membersByTourId[id] = membersQueries[index].data!;
    });

    return computePassportStats({
      userId,
      tours: toursQuery.data.map((t) => ({ id: t.id, actName: t.act.name })),
      stopsByTourId,
      membersByTourId,
    });
  }, [userId, toursQuery.data, tourIds, stopsQueries, membersQueries]);

  const refetchAll = () => {
    toursQuery.refetch();
    stopsQueries.forEach((q) => q.refetch());
    membersQueries.forEach((q) => q.refetch());
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="title">Passport</Text>
        <Text color="textMuted">Your lifetime on the road.</Text>
      </View>

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
            Join or create a tour to start building your passport.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
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
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    gap: spacing.xs,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
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
