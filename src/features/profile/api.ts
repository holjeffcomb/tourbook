import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  bio: string | null;
  default_role: string | null;
};

export type ProfileUpdate = {
  displayName: string;
  username: string | null;
  bio: string | null;
  defaultRole: string | null;
};

const profileSelect = 'id, display_name, username, bio, default_role';

export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select(profileSelect)
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateProfile(userId: string, values: ProfileUpdate): Promise<void> {
  const username = values.username?.trim() || null;
  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: values.displayName.trim(),
      username,
      bio: values.bio?.trim() || null,
      default_role: values.defaultRole?.trim() || null,
    })
    .eq('id', userId);
  if (error) throw error;
}

export async function searchProfiles(term: string, excludeUserId?: string): Promise<Profile[]> {
  const q = term.trim();
  if (q.length < 2) return [];

  const escaped = q.replace(/[\\%_]/g, (match) => `\\${match}`);

  let query = supabase
    .from('profiles')
    .select(profileSelect)
    .or(`username.ilike.%${escaped}%,display_name.ilike.%${escaped}%`)
    .limit(20);

  if (excludeUserId) query = query.neq('id', excludeUserId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listPublicToursForUser(userId: string) {
  const { data, error } = await supabase
    .from('tour_members')
    .select(
      'role, tour:tours(id, title, start_date, end_date, visibility, created_at, created_by, act:acts(id, name))',
    )
    .eq('user_id', userId);
  if (error) throw error;

  type Row = {
    role: string | null;
    tour: {
      id: string;
      title: string | null;
      start_date: string | null;
      end_date: string | null;
      visibility: string;
      created_at: string;
      created_by: string | null;
      act: { id: string; name: string };
    } | null;
  };

  return ((data ?? []) as unknown as Row[])
    .filter((row) => row.tour && row.tour.visibility === 'public')
    .map((row) => ({ ...row.tour!, myRole: row.role }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
