import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { listVisibleToursForUser } from '@/features/social/api';
import { profileLabel } from '@/features/social/labels';
import { useFriends, visibleToursKey } from '@/features/social/queries';
import { useTours } from '@/features/tours/queries';

export type FriendOnTour = {
  id: string;
  name: string;
};

export type FriendsTourEntry = {
  id: string;
  actName: string;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  friends: FriendOnTour[];
};

function tourSortKey(entry: FriendsTourEntry): string {
  const date = entry.startDate ?? entry.endDate ?? '';
  return `${date}\0${entry.actName}`;
}

/**
 * Aggregates visible tours across all friends, deduped by tour id.
 */
export function useFriendsTours() {
  const friendsQuery = useFriends();
  const myToursQuery = useTours();
  const friends = friendsQuery.data ?? [];

  const friendTourQueries = useQueries({
    queries: friends.map((friend) => ({
      queryKey: visibleToursKey(friend.other.id),
      queryFn: () => listVisibleToursForUser(friend.other.id),
      enabled: friends.length > 0,
      staleTime: 60_000,
    })),
  });

  const myTourIds = useMemo(
    () => new Set(myToursQuery.data?.map((tour) => tour.id) ?? []),
    [myToursQuery.data],
  );

  const entries = useMemo((): FriendsTourEntry[] => {
    if (friends.length === 0) return [];

    const byTourId = new Map<string, FriendsTourEntry>();

    friends.forEach((friend, index) => {
      const tours = friendTourQueries[index]?.data ?? [];
      const friendInfo: FriendOnTour = {
        id: friend.other.id,
        name: profileLabel(friend.other),
      };

      for (const tour of tours) {
        const existing = byTourId.get(tour.id);
        if (existing) {
          if (!existing.friends.some((f) => f.id === friendInfo.id)) {
            existing.friends.push(friendInfo);
          }
          continue;
        }

        byTourId.set(tour.id, {
          id: tour.id,
          actName: tour.act.name,
          title: tour.title,
          startDate: tour.start_date,
          endDate: tour.end_date,
          friends: [friendInfo],
        });
      }
    });

    return [...byTourId.values()].sort((a, b) => tourSortKey(b).localeCompare(tourSortKey(a)));
  }, [friends, friendTourQueries]);

  const isLoading =
    friendsQuery.isLoading ||
    myToursQuery.isLoading ||
    (friends.length > 0 && friendTourQueries.some((query) => query.isLoading));

  const isError =
    friendsQuery.isError || friendTourQueries.some((query) => query.isError);

  const refetch = () => {
    friendsQuery.refetch();
    myToursQuery.refetch();
    friendTourQueries.forEach((query) => query.refetch());
  };

  const isRefetching =
    friendsQuery.isRefetching ||
    myToursQuery.isRefetching ||
    friendTourQueries.some((query) => query.isRefetching);

  return {
    entries,
    myTourIds,
    friendCount: friends.length,
    isLoading,
    isError,
    refetch,
    isRefetching,
  };
}
