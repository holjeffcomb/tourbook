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
