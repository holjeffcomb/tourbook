import { useQuery } from '@tanstack/react-query';
import { useFriends } from '@/features/social/queries';
import { getVenue, listVenuePlayers } from '@/features/venues/api';
import { isMapboxConfigured, searchPlaces } from '@/lib/mapbox';

export function usePlaceSuggestions(
  query: string,
  sessionToken: string,
  city?: string,
  enabled = true,
) {
  const term = query.trim();
  const cityPart = city?.trim() ?? '';

  return useQuery({
    queryKey: ['places', 'search', term, cityPart],
    queryFn: () => searchPlaces(term, sessionToken, cityPart || undefined),
    enabled: enabled && term.length >= 2 && isMapboxConfigured(),
    // Don't stick on empty typeahead misses for complete venue names.
    staleTime: 0,
    gcTime: 60_000,
  });
}

export function useVenue(id: string) {
  return useQuery({
    queryKey: ['venues', id],
    queryFn: () => getVenue(id),
    enabled: !!id,
  });
}

export function useVenuePlayers(venueId: string) {
  const friendsQuery = useFriends();
  const friendIds = new Set((friendsQuery.data ?? []).map((f) => f.other.id));

  return useQuery({
    queryKey: ['venues', venueId, 'players', [...friendIds].sort().join(',')],
    queryFn: () => listVenuePlayers(venueId, friendIds),
    enabled: !!venueId,
  });
}
