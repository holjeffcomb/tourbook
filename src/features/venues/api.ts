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
    .select('id, latitude')
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
    return existing.id;
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
  latitude: number | null;
  longitude: number | null;
  address: string | null;
};

export async function getVenue(id: string): Promise<Venue> {
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, city, latitude, longitude, address')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
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
