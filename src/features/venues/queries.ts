import { useQuery } from '@tanstack/react-query';
import { searchVenues } from '@/features/venues/api';

export function useVenueSearch(query: string) {
  const term = query.trim();

  return useQuery({
    queryKey: ['venues', 'search', term],
    queryFn: () => searchVenues(term),
    enabled: term.length >= 2,
    staleTime: 60_000,
  });
}
