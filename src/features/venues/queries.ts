import { useQuery } from '@tanstack/react-query';
import { useFriends } from '@/features/social/queries';
import { getVenue, listVenuePlayers, searchVenues } from '@/features/venues/api';
import { isMapboxConfigured, searchPlaces } from '@/lib/mapbox';

/**
 * Suggestions from our own venue catalog (venues other users have already logged).
 * Independent of Mapbox, so it works even when place search isn't configured.
 */
export function useVenueSuggestions(term: string, cityBias?: string, enabled = true) {
  const q = term.trim();
  const city = cityBias?.trim() ?? '';

  return useQuery({
    queryKey: ['venues', 'search', q, city],
    queryFn: () => searchVenues(q, city || undefined),
    enabled: enabled && q.length >= 2,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

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
