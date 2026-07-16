import { useQueries } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/AuthContext';
import { TAB_BAR_HEIGHT } from '@/features/maps/mapScene';
import { listStops } from '@/features/shows/api';
import { showsKey } from '@/features/shows/queries';
import { computePassportStats, computeTourRoutes, computeVisitedPlaces } from '@/features/stats/compute';
import type { TourStop } from '@/features/shows/api';
import {
  LifetimeMapExperience,
  type LifetimeStatus,
} from '@/features/stats/lifetime/LifetimeMapExperience';
import { listTourMembers } from '@/features/tours/api';
import { membersKey, useTours } from '@/features/tours/queries';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The Lifetime tab. This screen owns *data orchestration* only — fetching every
 * tour's stops and members, deriving stats/places/routes for the active year —
 * and hands them to `LifetimeMapExperience`, which owns the spatial, map-first
 * interaction model (full-bleed map + floating header + gesture stats sheet).
 */
export function PassportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  // Years present in the data, most recent first, for the filter.
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
        tourNames: p.tourIds
          .map((id) => tours.find((t) => t.id === id)?.actName)
          .filter((name): name is string => !!name),
        firstVisit: p.firstVisit,
        lastVisit: p.lastVisit,
      })),
      routes: computeTourRoutes(filtered).map((r) => ({
        id: r.tourId,
        coordinates: r.coordinates,
      })),
    };
  }, [stopsByTourIdAll, membersByTourId, toursQuery.data, userId, selectedYear]);

  const refetchAll = useCallback(() => {
    toursQuery.refetch();
    stopsQueries.forEach((q) => q.refetch());
    membersQueries.forEach((q) => q.refetch());
  }, [toursQuery, stopsQueries, membersQueries]);

  const onPressPerson = useCallback(
    (id: string) => router.push({ pathname: '/people/[id]', params: { id } }),
    [router],
  );

  const status: LifetimeStatus = isLoading
    ? 'loading'
    : isError
      ? 'error'
      : !stats || stats.tourCount === 0
        ? 'empty'
        : 'ready';

  return (
    <LifetimeMapExperience
      title="Lifetime"
      status={status}
      stats={stats}
      places={places}
      routes={routes}
      years={years}
      selectedYear={selectedYear}
      onSelectYear={setSelectedYear}
      onPressPerson={onPressPerson}
      onRetry={refetchAll}
      bottomChrome={TAB_BAR_HEIGHT + insets.bottom}
    />
  );
}
