import { supabase } from '@/lib/supabase';

export type ActSuggestion = { id: string; name: string };

// Mirrors the DB's generated `normalized_name` (lower(btrim(name))) so client
// lookups match the unique dedup key.
function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

// Escapes characters that are wildcards in a Postgres ILIKE pattern.
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export async function searchActs(query: string): Promise<ActSuggestion[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const { data, error } = await supabase
    .from('acts')
    .select('id, name')
    .ilike('name', `%${escapeLike(term)}%`)
    .order('name')
    .limit(8);
  if (error) throw error;
  return data ?? [];
}

async function findActIdByName(normalized: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('acts')
    .select('id')
    .eq('normalized_name', normalized)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/**
 * Returns the id of the shared act with this name, creating it if needed.
 * If a concurrent insert wins the unique-name race, we re-select the winner.
 */
export async function getOrCreateAct(name: string, userId: string): Promise<string> {
  const normalized = normalizeName(name);

  const existingId = await findActIdByName(normalized);
  if (existingId) return existingId;

  const { data, error } = await supabase
    .from('acts')
    .insert({ name: name.trim(), created_by: userId })
    .select('id')
    .single();

  if (error) {
    const racedId = await findActIdByName(normalized);
    if (racedId) return racedId;
    throw error;
  }

  return data.id;
}
