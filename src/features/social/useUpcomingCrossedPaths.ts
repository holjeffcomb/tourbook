import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { toStop, type StopRow } from '@/features/shows/api';
import { type CrossedPathRow, listCrossedPaths } from '@/features/social/api';
import { profileLabel } from '@/features/social/labels';
import { useFriends } from '@/features/social/queries';
import { buildNearMiss, isUpcomingNearMiss, type OverlapTour } from '@/features/stats/compute';
import type { NearMiss } from '@/features/stats/types';
import { dateToISO } from '@/lib/date';
import { queryKeys } from '@/lib/queryKeys';

export type UpcomingCrossedPath = {
  friendId: string;
  friendName: string;
  nearMiss: NearMiss;
};

const DEFAULT_MAX_MILES = 100;
const DEFAULT_DATE_WINDOW = 0;

// Rebuilds a TourStop from the flat RPC columns for one side by feeding the exact
// same `toStop` normalizer the read path uses — so labels/coordinates match.
function toStopFromRow(
  side: 'my' | 'their',
  row: CrossedPathRow,
): { stop: ReturnType<typeof toStop>; tour: OverlapTour } {
  const g = <T,>(key: string): T => (row as unknown as Record<string, T>)[`${side}_${key}`];
  const venueId = g<string | null>('venue_id');
  const stopRow: StopRow = {
    id: g<string>('stop_id'),
    date: g<string>('date'),
    kind: g<'show' | 'off'>('kind'),
    label: g<string | null>('label'),
    city: g<string | null>('city'),
    country: g<string | null>('country'),
    latitude: g<number | null>('lat'),
    longitude: g<number | null>('lng'),
    address: g<string | null>('address'),
    created_at: '',
    created_by: null,
    venue: venueId
      ? {
          id: venueId,
          name: g<string | null>('venue_name') ?? '',
          city: g<string | null>('venue_city') ?? '',
          country: g<string | null>('venue_country'),
          latitude: g<number | null>('venue_lat'),
          longitude: g<number | null>('venue_lng'),
        }
      : null,
  };
  return {
    stop: toStop(stopRow),
    tour: {
      id: g<string>('tour_id'),
      actName: g<string | null>('act_name') ?? '',
      title: g<string | null>('tour_title'),
    },
  };
}

function rowToNearMiss(row: CrossedPathRow): NearMiss {
  return buildNearMiss(toStopFromRow('my', row), toStopFromRow('their', row), row.miles);
}

/**
 * Upcoming near-misses between the current user and their friends. The scan runs on
 * the server (`crossed_paths` RPC) and returns matched pairs only; here we map each
 * pair to a NearMiss and keep the upcoming ones (relative to the device's date).
 * Used for in-app alerts (not push). Past overlaps are ignored.
 */
export function useUpcomingCrossedPaths() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const friendsQuery = useFriends();
  const today = dateToISO(new Date());

  const crossingsQuery = useQuery({
    queryKey: queryKeys.friends.crossings(userId ?? 'anonymous'),
    queryFn: () =>
      listCrossedPaths({ maxMiles: DEFAULT_MAX_MILES, dateWindowDays: DEFAULT_DATE_WINDOW }),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const isLoading = friendsQuery.isLoading || crossingsQuery.isLoading;

  const items = useMemo((): UpcomingCrossedPath[] => {
    const rows = crossingsQuery.data ?? [];
    const out: UpcomingCrossedPath[] = [];

    for (const row of rows) {
      const nearMiss = rowToNearMiss(row);
      if (!isUpcomingNearMiss(nearMiss, today)) continue;
      out.push({
        friendId: row.friend_id,
        friendName: profileLabel({
          display_name: row.friend_display_name,
          username: row.friend_username,
        }),
        nearMiss,
      });
    }

    return out.sort((a, b) => {
      const dateA =
        a.nearMiss.dateA >= a.nearMiss.dateB ? a.nearMiss.dateA : a.nearMiss.dateB;
      const dateB =
        b.nearMiss.dateA >= b.nearMiss.dateB ? b.nearMiss.dateA : b.nearMiss.dateB;
      return dateA.localeCompare(dateB);
    });
  }, [crossingsQuery.data, today]);

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
    friendCount: friendsQuery.data?.length ?? 0,
  };
}
