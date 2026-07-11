import { useQuery } from '@tanstack/react-query';
import { isMapboxConfigured, suggestPlaces } from '@/lib/mapbox';

export function usePlaceSuggestions(query: string, sessionToken: string) {
  const term = query.trim();

  return useQuery({
    queryKey: ['places', 'suggest', term],
    queryFn: () => suggestPlaces(term, sessionToken),
    enabled: term.length >= 2 && isMapboxConfigured(),
    staleTime: 60_000,
  });
}
