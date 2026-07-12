import { useQuery } from '@tanstack/react-query';
import { useFriends } from '@/features/social/queries';
import { getVenue, listVenuePlayers } from '@/features/venues/api';
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
