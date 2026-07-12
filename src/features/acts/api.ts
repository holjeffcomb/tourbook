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

export async function getAct(id: string): Promise<ActSuggestion> {
  const { data, error } = await supabase.from('acts').select('id, name').eq('id', id).single();
  if (error) throw error;
  return data;
}

export type ActCrewMember = {
  userId: string;
  displayName: string | null;
  username: string | null;
  role: string | null;
  tourCount: number;
  isFriend: boolean;
};

/** Members on visible tours for this act; friends highlighted. */
export async function listActCrew(
  actId: string,
  friendIds: Set<string>,
): Promise<ActCrewMember[]> {
  const { data, error } = await supabase
    .from('tours')
    .select(
      'id, members:tour_members(user_id, role, profile:profiles(display_name, username))',
    )
    .eq('act_id', actId);
  if (error) throw error;

  type Row = {
    id: string;
    members: {
      user_id: string;
      role: string | null;
      profile: { display_name: string | null; username: string | null } | null;
    }[];
  };

  const byUser = new Map<
    string,
    { displayName: string | null; username: string | null; role: string | null; tourCount: number }
  >();

  for (const tour of (data ?? []) as unknown as Row[]) {
    for (const member of tour.members ?? []) {
      const existing = byUser.get(member.user_id);
      if (existing) {
        existing.tourCount += 1;
        if (!existing.role && member.role) existing.role = member.role;
      } else {
        byUser.set(member.user_id, {
          displayName: member.profile?.display_name ?? null,
          username: member.profile?.username ?? null,
          role: member.role,
          tourCount: 1,
        });
      }
    }
  }

  return [...byUser.entries()]
    .map(([userId, info]) => ({
      userId,
      displayName: info.displayName,
      username: info.username,
      role: info.role,
      tourCount: info.tourCount,
      isFriend: friendIds.has(userId),
    }))
    .sort((a, b) => {
      if (a.isFriend !== b.isFriend) return a.isFriend ? -1 : 1;
      return b.tourCount - a.tourCount;
    });
}
