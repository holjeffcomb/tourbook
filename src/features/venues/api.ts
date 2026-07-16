import { reverseGeocodeCountry } from '@/lib/mapbox';
import { supabase } from '@/lib/supabase';

// Mirrors the DB's generated normalized columns (lower(btrim(...))) so client
// lookups match the unique (normalized_name, normalized_city) dedup key.
function normalize(value: string) {
  return value.trim().toLowerCase();
}

async function findVenueId(normalizedName: string, normalizedCity: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('venues')
    .select('id, latitude')
    .eq('normalized_name', normalizedName)
    .eq('normalized_city', normalizedCity)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export type VenueInput = {
  name: string;
  city: string;
  userId: string;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  country?: string | null;
};

/**
 * Returns the id of the shared venue with this name+city, creating it if needed.
 * Re-selects the winner if a concurrent insert wins the unique race. When the
 * venue already exists but has no coordinates, backfills them from this input.
 */
export async function getOrCreateVenue(input: VenueInput): Promise<string> {
  const normalizedName = normalize(input.name);
  const normalizedCity = normalize(input.city);
  const hasCoords = input.latitude != null && input.longitude != null;

  const { data: existing, error: findError } = await supabase
    .from('venues')
    .select('id, latitude, country')
    .eq('normalized_name', normalizedName)
    .eq('normalized_city', normalizedCity)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    if (hasCoords && existing.latitude == null) {
      await supabase
        .from('venues')
        .update({
          latitude: input.latitude,
          longitude: input.longitude,
          address: input.address ?? null,
        })
        .eq('id', existing.id);
    }
    // Backfill the country on venues created before it was captured.
    if (input.country && existing.country == null) {
      await supabase.from('venues').update({ country: input.country }).eq('id', existing.id);
    }
    return existing.id;
  }

  // No exact name+city match. If we have coordinates, the same physical venue may
  // already exist under different text (e.g. "Denver" vs "Denver, CO"); reuse it
  // instead of forking a duplicate.
  if (hasCoords) {
    const { data: nearby, error: nearbyError } = await supabase.rpc('find_nearby_venue', {
      lat: input.latitude as number,
      lng: input.longitude as number,
      radius_m: 75,
      name_hint: input.name.trim(),
    });
    if (nearbyError) throw nearbyError;
    const match = nearby?.[0];
    if (match) {
      if (input.country) {
        await supabase
          .from('venues')
          .update({ country: input.country })
          .eq('id', match.id)
          .is('country', null);
      }
      return match.id;
    }
  }

  const { data, error } = await supabase
    .from('venues')
    .insert({
      name: input.name.trim(),
      city: input.city.trim(),
      created_by: input.userId,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      address: input.address ?? null,
      country: input.country ?? null,
    })
    .select('id')
    .single();

  if (error) {
    const racedId = await findVenueId(normalizedName, normalizedCity);
    if (racedId) return racedId;
    throw error;
  }

  return data.id;
}

export type Venue = {
  id: string;
  name: string;
  city: string;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
};

export async function getVenue(id: string): Promise<Venue> {
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, city, country, latitude, longitude, address')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

/**
 * For venues that have coordinates but no stored country (typical of Euro stops
 * whose city is just "Berlin"), reverse-geocode and persist the country. Returns
 * a map of venueId → country for callers to patch in-memory rows immediately.
 */
export async function backfillVenueCountries(
  venues: { id: string; country: string | null; latitude: number | null; longitude: number | null }[],
): Promise<Map<string, string>> {
  const filled = new Map<string, string>();
  const missing = venues.filter(
    (v) => !v.country?.trim() && v.latitude != null && v.longitude != null,
  );
  if (missing.length === 0) return filled;

  // Deduplicate by id — a tour can hit the same venue twice.
  const unique = new Map(missing.map((v) => [v.id, v]));
  await Promise.all(
    [...unique.values()].map(async (v) => {
      const country = await reverseGeocodeCountry(v.longitude as number, v.latitude as number);
      if (!country) return;
      filled.set(v.id, country);
      await supabase.from('venues').update({ country }).eq('id', v.id);
    }),
  );
  return filled;
}

export type VenueSuggestion = {
  id: string;
  name: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  /** Booked shows that reference this venue — drives popularity ranking. */
  showCount: number;
};

/**
 * Searches the shared venue catalog by name (or city), best-first: exact match,
 * then prefix, then the current city, then popularity. Lets a user pick a venue
 * that already exists (with its coordinates) instead of re-entering it.
 */
export async function searchVenues(term: string, cityBias?: string): Promise<VenueSuggestion[]> {
  const q = term.trim();
  if (q.length < 2) return [];

  const { data, error } = await supabase.rpc('search_venues', {
    term: q,
    city_bias: cityBias?.trim() || undefined,
    max_results: 8,
  });
  if (error) throw error;

  type Row = {
    id: string;
    name: string;
    city: string;
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    show_count: number | null;
  };

  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    city: r.city,
    latitude: r.latitude,
    longitude: r.longitude,
    address: r.address,
    showCount: Number(r.show_count ?? 0),
  }));
}

export type VenuePlayer = {
  userId: string;
  displayName: string | null;
  username: string | null;
  showCount: number;
  isFriend: boolean;
};

/** People on visible tours that stopped at this venue (RLS-filtered). */
export async function listVenuePlayers(
  venueId: string,
  friendIds: Set<string>,
): Promise<VenuePlayer[]> {
  const { data, error } = await supabase
    .from('shows')
    .select(
      'tour_id, tour:tours!inner(id, members:tour_members(user_id, profile:profiles(display_name, username)))',
    )
    .eq('venue_id', venueId)
    .eq('kind', 'show');
  if (error) throw error;

  type Row = {
    tour_id: string;
    tour: {
      id: string;
      members: {
        user_id: string;
        profile: { display_name: string | null; username: string | null } | null;
      }[];
    } | null;
  };

  const counts = new Map<
    string,
    { displayName: string | null; username: string | null; showCount: number }
  >();

  for (const row of (data ?? []) as unknown as Row[]) {
    for (const member of row.tour?.members ?? []) {
      const existing = counts.get(member.user_id);
      if (existing) existing.showCount += 1;
      else {
        counts.set(member.user_id, {
          displayName: member.profile?.display_name ?? null,
          username: member.profile?.username ?? null,
          showCount: 1,
        });
      }
    }
  }

  return [...counts.entries()]
    .map(([userId, info]) => ({
      userId,
      displayName: info.displayName,
      username: info.username,
      showCount: info.showCount,
      isFriend: friendIds.has(userId),
    }))
    .sort((a, b) => {
      if (a.isFriend !== b.isFriend) return a.isFriend ? -1 : 1;
      return b.showCount - a.showCount;
    });
}
