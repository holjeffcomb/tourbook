import { useQueries } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { StatGrid } from '@/components/StatGrid';
import { Text } from '@/components/Text';
import { useAuth } from '@/features/auth/AuthContext';
import { useProfile } from '@/features/profile/queries';
import { listStops } from '@/features/shows/api';
import { showsKey } from '@/features/shows/queries';
import { profileLabel } from '@/features/social/labels';
import { useAreFriends, useVisibleToursForUser } from '@/features/social/queries';
import { computeOverlap, isUpcomingDate } from '@/features/stats/compute';
import { useTours } from '@/features/tours/queries';
import { dateToISO, formatShowDate } from '@/lib/date';
import { formatMiles } from '@/lib/geo';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useThemedStyles } from '@/theme/ThemeProvider';

export function CompareScreen() {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const myId = session?.user.id;

  const friendProfile = useProfile(id);
  const areFriends = useAreFriends(id);
  const myTours = useTours();
  const theirTours = useVisibleToursForUser(id, !!areFriends.data);

  const myTourIds = myTours.data?.map((t) => t.id) ?? [];
  const theirTourIds = theirTours.data?.map((t) => t.id) ?? [];

  const myStopsQueries = useQueries({
    queries: myTourIds.map((tourId) => ({
      queryKey: showsKey(tourId),
      queryFn: () => listStops(tourId),
      enabled: !!tourId && !!areFriends.data,
    })),
  });

  const theirStopsQueries = useQueries({
    queries: theirTourIds.map((tourId) => ({
      queryKey: showsKey(tourId),
      queryFn: () => listStops(tourId),
      enabled: !!tourId && !!areFriends.data,
    })),
  });

  const isLoading =
    areFriends.isLoading ||
    myTours.isLoading ||
    theirTours.isLoading ||
    myStopsQueries.some((q) => q.isLoading) ||
    theirStopsQueries.some((q) => q.isLoading);

  const overlap = useMemo(() => {
    if (!myId || !myTours.data || !theirTours.data || !areFriends.data) return null;

    const stopsByTourIdA: Record<string, Awaited<ReturnType<typeof listStops>>> = {};
    const stopsByTourIdB: Record<string, Awaited<ReturnType<typeof listStops>>> = {};

    myTourIds.forEach((tourId, index) => {
      if (myStopsQueries[index]?.data) stopsByTourIdA[tourId] = myStopsQueries[index].data!;
    });
    theirTourIds.forEach((tourId, index) => {
      if (theirStopsQueries[index]?.data) stopsByTourIdB[tourId] = theirStopsQueries[index].data!;
    });

    return computeOverlap({
      toursA: myTours.data.map((t) => ({
        id: t.id,
        actName: t.act.name,
        title: t.title,
      })),
      toursB: theirTours.data.map((t) => ({
        id: t.id,
        actName: t.act.name,
        title: t.title,
      })),
      stopsByTourIdA,
      stopsByTourIdB,
    });
  }, [
    myId,
    myTours.data,
    theirTours.data,
    areFriends.data,
    myTourIds,
    theirTourIds,
    myStopsQueries,
    theirStopsQueries,
  ]);

  const theirName = profileLabel(friendProfile.data);
  const today = dateToISO(new Date());
  const upcomingDates =
    overlap?.sameDates.filter((row) => isUpcomingDate(row.date, today)) ?? [];
  const pastDates =
    overlap?.sameDates.filter((row) => !isUpcomingDate(row.date, today)) ?? [];

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text variant="body" color="primary" onPress={() => router.back()}>
          Back
        </Text>
      </View>

      <Text variant="title">Compare</Text>
      <Text color="textMuted" style={styles.subtitle}>
        You and {theirName}
      </Text>

      {!areFriends.isLoading && !areFriends.data ? (
        <View style={styles.center}>
          <Text color="textMuted">Comparison is available for friends only.</Text>
          <Button title="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !overlap ? (
        <View style={styles.center}>
          <Text color="danger">Couldn&apos;t compare histories.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <StatGrid
            items={[
              { label: 'Shared tours', value: String(overlap.sharedTourCount) },
              { label: 'Same dates', value: String(overlap.sameDateCount) },
              { label: 'Mutual acts', value: String(overlap.mutualActs.length) },
              { label: 'Mutual venues', value: String(overlap.mutualVenues.length) },
              { label: 'Mutual cities', value: String(overlap.mutualCities.length) },
              {
                label: 'Mutual countries',
                value: String(overlap.mutualCountries.length),
              },
            ]}
          />

          <Card>
            <Text variant="caption" color="textMuted">
              Side by side
            </Text>
            <View style={styles.sideBySide}>
              <View style={styles.side}>
                <Text variant="heading">You</Text>
                <Text color="textMuted">{overlap.you.shows} shows</Text>
                <Text color="textMuted">{formatMiles(overlap.you.miles)}</Text>
                <Text color="textMuted">{overlap.you.cities} cities</Text>
              </View>
              <View style={styles.side}>
                <Text variant="heading">{theirName}</Text>
                <Text color="textMuted">{overlap.them.shows} shows</Text>
                <Text color="textMuted">{formatMiles(overlap.them.miles)}</Text>
                <Text color="textMuted">{overlap.them.cities} cities</Text>
              </View>
            </View>
          </Card>

          <Button
            title={
              upcomingDates.length > 0
                ? `Crossed paths (${upcomingDates.length} upcoming)`
                : 'Crossed paths'
            }
            onPress={() =>
              router.push({ pathname: '/people/[id]/near-misses', params: { id } })
            }
          />

          {overlap.sharedTours.length > 0 && (
            <View style={styles.section}>
              <Text variant="heading">Shared tours</Text>
              {overlap.sharedTours.map((tour) => (
                <Pressable
                  key={tour.id}
                  onPress={() =>
                    router.push({ pathname: '/tours/[id]', params: { id: tour.id } })
                  }
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <Text variant="body">{tour.actName}</Text>
                  {!!tour.title && (
                    <Text variant="caption" color="textMuted">
                      {tour.title}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>
          )}

          {overlap.mutualActs.length > 0 && (
            <View style={styles.section}>
              <Text variant="heading">Mutual acts</Text>
              <Text color="textMuted">{overlap.mutualActs.join(', ')}</Text>
            </View>
          )}

          {overlap.mutualVenues.length > 0 && (
            <View style={styles.section}>
              <Text variant="heading">Mutual venues</Text>
              <Text color="textMuted">{overlap.mutualVenues.join(', ')}</Text>
            </View>
          )}

          {upcomingDates.length > 0 && (
            <View style={styles.section}>
              <Text variant="heading">Upcoming same days</Text>
              {upcomingDates.slice(0, 20).map((row) => (
                <Card key={`up-${row.date}-${row.stopA}-${row.stopB}`}>
                  <Text variant="caption" color="primary">
                    Upcoming · {formatShowDate(row.date)}
                  </Text>
                  <Text>You: {row.stopA}</Text>
                  <Text>
                    {theirName}: {row.stopB}
                  </Text>
                </Card>
              ))}
            </View>
          )}

          {pastDates.length > 0 && (
            <View style={styles.section}>
              <Text variant="heading">Past same days</Text>
              {pastDates.slice(0, 20).map((row) => (
                <Card key={`past-${row.date}-${row.stopA}-${row.stopB}`}>
                  <Text variant="caption" color="textMuted">
                    {formatShowDate(row.date)}
                  </Text>
                  <Text>You: {row.stopA}</Text>
                  <Text>
                    {theirName}: {row.stopB}
                  </Text>
                </Card>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    topBar: {
      paddingTop: spacing.md,
      marginBottom: spacing.sm,
    },
    subtitle: {
      marginBottom: spacing.md,
    },
    body: {
      gap: spacing.md,
      paddingBottom: spacing.xl,
    },
    sideBySide: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    side: {
      flex: 1,
      gap: spacing.xs,
    },
    section: {
      gap: spacing.sm,
    },
    row: {
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      gap: spacing.xs,
    },
    pressed: {
      opacity: 0.7,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
  });
