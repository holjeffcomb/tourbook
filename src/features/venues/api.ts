import { supabase } from '@/lib/supabase';

// Mirrors the DB's generated normalized columns (lower(btrim(...))) so client
// lookups match the unique (normalized_name, normalized_city) dedup key.
function normalize(value: string) {
  return value.trim().toLowerCase();
}

async function findVenueId(normalizedName: string, normalizedCity: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('venues')
    .select('id')
    .eq('normalized_name', normalizedName)
    .eq('normalized_city', normalizedCity)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/**
 * Returns the id of the shared venue with this name+city, creating it if needed.
 * Re-selects the winner if a concurrent insert wins the unique race.
 */
export async function getOrCreateVenue(
  name: string,
  city: string,
  userId: string,
): Promise<string> {
  const normalizedName = normalize(name);
  const normalizedCity = normalize(city);

  const existingId = await findVenueId(normalizedName, normalizedCity);
  if (existingId) return existingId;

  const { data, error } = await supabase
    .from('venues')
    .insert({ name: name.trim(), city: city.trim(), created_by: userId })
    .select('id')
    .single();

  if (error) {
    const racedId = await findVenueId(normalizedName, normalizedCity);
    if (racedId) return racedId;
    throw error;
  }

  return data.id;
}
