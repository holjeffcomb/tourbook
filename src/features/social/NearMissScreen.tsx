import { useQueries } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useAuth } from '@/features/auth/AuthContext';
import { useProfile } from '@/features/profile/queries';
import { listStops } from '@/features/shows/api';
import { showsKey } from '@/features/shows/queries';
import { NearMissMap } from '@/features/social/NearMissMap';
import { profileLabel } from '@/features/social/labels';
import { useAreFriends, useVisibleToursForUser } from '@/features/social/queries';
import { computeNearMisses } from '@/features/stats/compute';
import type { NearMiss } from '@/features/stats/types';
import { useTours } from '@/features/tours/queries';
import { formatMiles } from '@/lib/geo';
import { colors, radius, spacing } from '@/theme';

const DISTANCE_PRESETS = [50, 100, 250] as const;
const WINDOW_PRESETS = [0, 1, 2] as const;

function kindLabel(kind: NearMiss['kind']) {
  if (kind === 'same_venue') return 'Same night, same building';
  if (kind === 'same_city') return 'Same city';
  return 'Nearby';
}

export function NearMissScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const myId = session?.user.id;

  const [maxMiles, setMaxMiles] = useState<(typeof DISTANCE_PRESETS)[number]>(100);
  const [dateWindowDays, setDateWindowDays] = useState<(typeof WINDOW_PRESETS)[number]>(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const nearMisses = useMemo(() => {
    if (!myId || !myTours.data || !theirTours.data || !areFriends.data) return [];

    const stopsByTourIdA: Record<string, Awaited<ReturnType<typeof listStops>>> = {};
    const stopsByTourIdB: Record<string, Awaited<ReturnType<typeof listStops>>> = {};
    myTourIds.forEach((tourId, index) => {
      if (myStopsQueries[index]?.data) stopsByTourIdA[tourId] = myStopsQueries[index].data!;
    });
    theirTourIds.forEach((tourId, index) => {
      if (theirStopsQueries[index]?.data) stopsByTourIdB[tourId] = theirStopsQueries[index].data!;
    });

    return computeNearMisses(
      myTours.data.map((t) => ({ id: t.id, actName: t.act.name, title: t.title })),
      theirTours.data.map((t) => ({ id: t.id, actName: t.act.name, title: t.title })),
      stopsByTourIdA,
      stopsByTourIdB,
      { maxMiles, dateWindowDays, excludeSameTour: true },
    );
  }, [
    myId,
    myTours.data,
    theirTours.data,
    areFriends.data,
    myTourIds,
    theirTourIds,
    myStopsQueries,
    theirStopsQueries,
    maxMiles,
    dateWindowDays,
  ]);

  const selected =
    nearMisses.find((n) => `${n.stopA.stopId}-${n.stopB.stopId}` === selectedId) ??
    nearMisses[0] ??
    null;

  const theirName = profileLabel(friendProfile.data);

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text variant="body" color="primary" onPress={() => router.back()}>
          Back
        </Text>
      </View>

      <Text variant="title">Almost crossed paths</Text>
      <Text color="textMuted" style={styles.subtitle}>
        With {theirName}
      </Text>

      {!areFriends.isLoading && !areFriends.data ? (
        <View style={styles.center}>
          <Text color="textMuted">Near-misses are available for friends only.</Text>
          <Button title="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.filters}>
            <Text variant="caption" color="textMuted">
              Distance
            </Text>
            <View style={styles.chips}>
              {DISTANCE_PRESETS.map((miles) => (
                <Pressable
                  key={miles}
                  onPress={() => setMaxMiles(miles)}
                  style={[styles.chip, maxMiles === miles && styles.chipSelected]}
                >
                  <Text color={maxMiles === miles ? 'primary' : 'text'}>{miles} mi</Text>
                </Pressable>
              ))}
            </View>
            <Text variant="caption" color="textMuted">
              Date window
            </Text>
            <View style={styles.chips}>
              {WINDOW_PRESETS.map((days) => (
                <Pressable
                  key={days}
                  onPress={() => setDateWindowDays(days)}
                  style={[styles.chip, dateWindowDays === days && styles.chipSelected]}
                >
                  <Text color={dateWindowDays === days ? 'primary' : 'text'}>
                    {days === 0 ? 'Same day' : `±${days} day${days === 1 ? '' : 's'}`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {selected && (
            <View style={styles.mapBlock}>
              <NearMissMap nearMiss={selected} />
              <Text variant="caption" color="textMuted" style={styles.mapCaption}>
                {formatMiles(selected.milesApart)} apart · {kindLabel(selected.kind)}
              </Text>
            </View>
          )}

          {nearMisses.length === 0 ? (
            <Text color="textMuted">
              No near-misses with these filters. Try a wider distance or date window.
            </Text>
          ) : (
            nearMisses.map((item) => {
              const key = `${item.stopA.stopId}-${item.stopB.stopId}`;
              const selectedRow = selected && key === `${selected.stopA.stopId}-${selected.stopB.stopId}`;
              const dateLabel =
                item.dateA === item.dateB
                  ? item.dateA
                  : `${item.dateA} / ${item.dateB}`;
              return (
                <Pressable
                  key={key}
                  onPress={() => setSelectedId(key)}
                  style={[styles.row, selectedRow && styles.rowSelected]}
                >
                  <Text variant="caption" color="textMuted">
                    {kindLabel(item.kind)} · {formatMiles(item.milesApart)}
                  </Text>
                  <Text variant="body">
                    You were {Math.round(item.milesApart)} mi apart — {item.stopA.city || item.stopA.label}{' '}
                    / {item.stopB.city || item.stopB.label} — {dateLabel}
                  </Text>
                  <Text variant="caption" color="textMuted">
                    You: {item.stopA.actName}
                    {item.stopA.tourTitle ? ` · ${item.stopA.tourTitle}` : ''}
                  </Text>
                  <Text variant="caption" color="textMuted">
                    {theirName}: {item.stopB.actName}
                    {item.stopB.tourTitle ? ` · ${item.stopB.tourTitle}` : ''}
                  </Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  filters: {
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.primary,
  },
  mapBlock: {
    gap: spacing.sm,
  },
  mapCaption: {
    textAlign: 'center',
  },
  row: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  rowSelected: {
    borderColor: colors.primary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
