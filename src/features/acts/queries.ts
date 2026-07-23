import { useQuery } from '@tanstack/react-query';
import { getAct, listActCrew, searchActs } from '@/features/acts/api';
import { useFriends } from '@/features/social/queries';
import { queryKeys } from '@/lib/queryKeys';

export function useActSearch(query: string) {
  const term = query.trim();

  return useQuery({
    queryKey: queryKeys.acts.search(term),
    queryFn: () => searchActs(term),
    enabled: term.length >= 2,
    staleTime: 60_000,
  });
}

export function useAct(id: string) {
  return useQuery({
    queryKey: queryKeys.acts.detail(id),
    queryFn: () => getAct(id),
    enabled: !!id,
  });
}

export function useActCrew(actId: string) {
  const friendsQuery = useFriends();
  const friendIds = new Set((friendsQuery.data ?? []).map((f) => f.other.id));

  return useQuery({
    queryKey: queryKeys.acts.crew(actId, [...friendIds].sort().join(',')),
    queryFn: () => listActCrew(actId, friendIds),
    enabled: !!actId,
  });
}
