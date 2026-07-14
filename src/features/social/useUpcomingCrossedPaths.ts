import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { listStops } from '@/features/shows/api';
import { showsKey } from '@/features/shows/queries';
import { listVisibleToursForUser } from '@/features/social/api';
import { profileLabel } from '@/features/social/labels';
import { useFriends, visibleToursKey } from '@/features/social/queries';
import {
  computeNearMisses,
  partitionNearMisses,
  type OverlapTour,
} from '@/features/stats/compute';
import type { NearMiss } from '@/features/stats/types';
import { useTours } from '@/features/tours/queries';
import { dateToISO } from '@/lib/date';

export type UpcomingCrossedPath = {
  friendId: string;
  friendName: string;
  nearMiss: NearMiss;
};

const DEFAULT_MAX_MILES = 100;
const DEFAULT_DATE_WINDOW = 0;

/**
 * Client-side scan of friends' visible tours for upcoming near-misses.
 * Used for in-app alerts (not push). Past overlaps are ignored.
 */
export function useUpcomingCrossedPaths() {
  const friendsQuery = useFriends();
  const myToursQuery = useTours();
  const friends = friendsQuery.data ?? [];
  const today = dateToISO(new Date());

  const friendTourQueries = useQueries({
    queries: friends.map((friend) => ({
      queryKey: visibleToursKey(friend.other.id),
      queryFn: () => listVisibleToursForUser(friend.other.id),
      enabled: friends.length > 0,
      staleTime: 60_000,
    })),
  });

  const myTourIds = myToursQuery.data?.map((t) => t.id) ?? [];
  const friendTourIds = useMemo(() => {
    const ids: string[] = [];
    for (const q of friendTourQueries) {
      for (const tour of q.data ?? []) ids.push(tour.id);
    }
    return ids;
  }, [friendTourQueries]);

  const allTourIds = useMemo(
    () => [...new Set([...myTourIds, ...friendTourIds])],
    [myTourIds, friendTourIds],
  );

  const stopQueries = useQueries({
    queries: allTourIds.map((tourId) => ({
      queryKey: showsKey(tourId),
      queryFn: () => listStops(tourId),
      enabled: allTourIds.length > 0,
      staleTime: 60_000,
    })),
  });

  const stopsByTourId = useMemo(() => {
    const map: Record<string, Awaited<ReturnType<typeof listStops>>> = {};
    allTourIds.forEach((tourId, index) => {
      const data = stopQueries[index]?.data;
      if (data) map[tourId] = data;
    });
    return map;
  }, [allTourIds, stopQueries]);

  const isLoading =
    friendsQuery.isLoading ||
    myToursQuery.isLoading ||
    friendTourQueries.some((q) => q.isLoading) ||
    (allTourIds.length > 0 && stopQueries.some((q) => q.isLoading));

  const items = useMemo((): UpcomingCrossedPath[] => {
    if (!myToursQuery.data || friends.length === 0) return [];

    const myTours: OverlapTour[] = myToursQuery.data.map((t) => ({
      id: t.id,
      actName: t.act.name,
      title: t.title,
    }));

    const out: UpcomingCrossedPath[] = [];

    friends.forEach((friend, index) => {
      const theirToursRaw = friendTourQueries[index]?.data;
      if (!theirToursRaw) return;

      const theirTours: OverlapTour[] = theirToursRaw.map((t) => ({
        id: t.id,
        actName: t.act.name,
        title: t.title,
      }));

      const stopsA: Record<string, (typeof stopsByTourId)[string]> = {};
      const stopsB: Record<string, (typeof stopsByTourId)[string]> = {};
      for (const tour of myTours) {
        if (stopsByTourId[tour.id]) stopsA[tour.id] = stopsByTourId[tour.id];
      }
      for (const tour of theirTours) {
        if (stopsByTourId[tour.id]) stopsB[tour.id] = stopsByTourId[tour.id];
      }

      const misses = computeNearMisses(myTours, theirTours, stopsA, stopsB, {
        maxMiles: DEFAULT_MAX_MILES,
        dateWindowDays: DEFAULT_DATE_WINDOW,
        excludeSameTour: true,
      });
      const { upcoming } = partitionNearMisses(misses, today);
      const name = profileLabel(friend.other);
      for (const nearMiss of upcoming) {
        out.push({ friendId: friend.other.id, friendName: name, nearMiss });
      }
    });

    return out.sort((a, b) => {
      const dateA =
        a.nearMiss.dateA >= a.nearMiss.dateB ? a.nearMiss.dateA : a.nearMiss.dateB;
      const dateB =
        b.nearMiss.dateA >= b.nearMiss.dateB ? b.nearMiss.dateA : b.nearMiss.dateB;
      return dateA.localeCompare(dateB);
    });
  }, [myToursQuery.data, friends, friendTourQueries, stopsByTourId, today]);

  const countByFriendId = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      map.set(item.friendId, (map.get(item.friendId) ?? 0) + 1);
    }
    return map;
  }, [items]);

  return {
    items,
    count: items.length,
    countByFriendId,
    isLoading,
    friendCount: friends.length,
  };
}
