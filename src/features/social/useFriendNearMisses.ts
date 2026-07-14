import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { listStops } from '@/features/shows/api';
import { showsKey } from '@/features/shows/queries';
import { useAreFriends, useVisibleToursForUser } from '@/features/social/queries';
import {
  computeNearMisses,
  isUpcomingNearMiss,
  partitionNearMisses,
} from '@/features/stats/compute';
import type { NearMiss } from '@/features/stats/types';
import { useTours } from '@/features/tours/queries';
import { dateToISO } from '@/lib/date';

export function nearMissPairKey(miss: NearMiss) {
  return `${miss.stopA.stopId}:${miss.stopB.stopId}`;
}

export function useFriendNearMisses(
  friendId: string,
  options: { maxMiles?: number; dateWindowDays?: number } = {},
) {
  const { session } = useAuth();
  const myId = session?.user.id;
  const today = dateToISO(new Date());
  const maxMiles = options.maxMiles ?? 100;
  const dateWindowDays = options.dateWindowDays ?? 0;

  const areFriends = useAreFriends(friendId);
  const myTours = useTours();
  const theirTours = useVisibleToursForUser(friendId, !!areFriends.data);

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

  const partitioned = useMemo(
    () => partitionNearMisses(nearMisses, today),
    [nearMisses, today],
  );

  function findByPair(stopAId: string, stopBId: string): NearMiss | null {
    return (
      nearMisses.find(
        (n) => n.stopA.stopId === stopAId && n.stopB.stopId === stopBId,
      ) ?? null
    );
  }

  return {
    areFriends: !!areFriends.data,
    areFriendsLoading: areFriends.isLoading,
    isLoading,
    nearMisses,
    upcoming: partitioned.upcoming,
    past: partitioned.past,
    today,
    isUpcoming: (miss: NearMiss) => isUpcomingNearMiss(miss, today),
    findByPair,
  };
}
