import { useQuery } from '@tanstack/react-query';
import { searchActs } from '@/features/acts/api';

export function useActSearch(query: string) {
  const term = query.trim();

  return useQuery({
    queryKey: ['acts', 'search', term],
    queryFn: () => searchActs(term),
    enabled: term.length >= 2,
    staleTime: 60_000,
  });
}
