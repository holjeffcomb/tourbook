import { useQuery } from '@tanstack/react-query';
import { getAct, listActCrew, searchActs } from '@/features/acts/api';
import { useFriends } from '@/features/social/queries';

export function useActSearch(query: string) {
  const term = query.trim();

  return useQuery({
    queryKey: ['acts', 'search', term],
    queryFn: () => searchActs(term),
    enabled: term.length >= 2,
    staleTime: 60_000,
  });
}

export function useAct(id: string) {
  return useQuery({
    queryKey: ['acts', id],
    queryFn: () => getAct(id),
    enabled: !!id,
  });
}

export function useActCrew(actId: string) {
  const friendsQuery = useFriends();
  const friendIds = new Set((friendsQuery.data ?? []).map((f) => f.other.id));

  return useQuery({
    queryKey: ['acts', actId, 'crew', [...friendIds].sort().join(',')],
    queryFn: () => listActCrew(actId, friendIds),
    enabled: !!actId,
  });
}
