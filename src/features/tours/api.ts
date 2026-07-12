import { getOrCreateAct } from '@/features/acts/api';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type TourVisibility = Database['public']['Enums']['visibility'];

export type TourWithAct = {
  id: string;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  visibility: TourVisibility;
  created_at: string;
  created_by: string | null;
  act: { id: string; name: string };
};

// A tour the current user is a member of, annotated with their own role.
export type MyTour = TourWithAct & { myRole: string | null };

export type TourMembership = { id: string; role: string | null };

const tourSelect =
  'id, title, start_date, end_date, visibility, created_at, created_by, act:acts(id, name)';

export async function listMyTours(userId: string): Promise<MyTour[]> {
  const { data, error } = await supabase
    .from('tour_members')
    .select(`role, tour:tours(${tourSelect})`)
    .eq('user_id', userId);
  if (error) throw error;

  const rows = (data ?? []) as unknown as { role: string | null; tour: TourWithAct }[];
  return rows
    .filter((row) => row.tour)
    .map((row) => ({ ...row.tour, myRole: row.role }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function getTour(id: string): Promise<TourWithAct> {
  const { data, error } = await supabase.from('tours').select(tourSelect).eq('id', id).single();
  if (error) throw error;
  return data as unknown as TourWithAct;
}

export type CreateTourInput = {
  userId: string;
  actName: string;
  role?: string;
  title?: string;
  startDate?: string | null;
  endDate?: string | null;
  visibility?: TourVisibility;
};

export async function createTour(input: CreateTourInput): Promise<{ id: string }> {
  const actId = await getOrCreateAct(input.actName, input.userId);

  const { data, error } = await supabase
    .from('tours')
    .insert({
      act_id: actId,
      created_by: input.userId,
      title: input.title?.trim() || null,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      visibility: input.visibility ?? 'public',
    })
    .select('id')
    .single();
  if (error) throw error;

  // The creator is automatically the first member; their role lives here.
  const { error: memberError } = await supabase
    .from('tour_members')
    .insert({ tour_id: data.id, user_id: input.userId, role: input.role?.trim() || null });
  if (memberError) throw memberError;

  return data;
}

export type UpdateTourInput = {
  userId: string;
  tourId: string;
  actName: string;
  title?: string;
  startDate?: string | null;
  endDate?: string | null;
  visibility?: TourVisibility;
};

// Updates the shared tour's details. Only the creator passes RLS.
export async function updateTour(input: UpdateTourInput): Promise<void> {
  const actId = await getOrCreateAct(input.actName, input.userId);

  const { error } = await supabase
    .from('tours')
    .update({
      act_id: actId,
      title: input.title?.trim() || null,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      ...(input.visibility ? { visibility: input.visibility } : {}),
    })
    .eq('id', input.tourId);
  if (error) throw error;
}

export async function deleteTour(tourId: string): Promise<void> {
  // Members and shows are removed automatically via ON DELETE CASCADE.
  const { error } = await supabase.from('tours').delete().eq('id', tourId);
  if (error) throw error;
}

// --- Membership -------------------------------------------------------------

export async function getMyMembership(
  tourId: string,
  userId: string,
): Promise<TourMembership | null> {
  const { data, error } = await supabase
    .from('tour_members')
    .select('id, role')
    .eq('tour_id', tourId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function updateMyRole(
  tourId: string,
  userId: string,
  role: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('tour_members')
    .update({ role: role?.trim() || null })
    .eq('tour_id', tourId)
    .eq('user_id', userId);
  if (error) throw error;
}

export type TourMember = {
  id: string;
  user_id: string;
  role: string | null;
  created_at: string;
  profile: { display_name: string | null; username: string | null } | null;
};

export async function listTourMembers(tourId: string): Promise<TourMember[]> {
  const { data, error } = await supabase
    .from('tour_members')
    .select('id, user_id, role, created_at, profile:profiles(display_name, username)')
    .eq('tour_id', tourId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as TourMember[];
}

export async function joinTour(
  tourId: string,
  userId: string,
  role: string | null = null,
): Promise<void> {
  // Idempotent: joining a tour you're already on is a no-op.
  const { error } = await supabase
    .from('tour_members')
    .upsert(
      { tour_id: tourId, user_id: userId, role: role?.trim() || null },
      { onConflict: 'tour_id,user_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function leaveTour(tourId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('tour_members')
    .delete()
    .eq('tour_id', tourId)
    .eq('user_id', userId);
  if (error) throw error;
}

// --- Discovery --------------------------------------------------------------

export type TourSearchResult = {
  id: string;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  act: { id: string; name: string };
  creator: { display_name: string | null } | null;
  memberCount: number;
};

// Existing tours for an act, so users join instead of creating duplicates.
export async function searchToursByAct(actId: string): Promise<TourSearchResult[]> {
  const { data, error } = await supabase
    .from('tours')
    .select(
      'id, title, start_date, end_date, created_at, act:acts(id, name), creator:profiles!created_by(display_name), members:tour_members(count)',
    )
    .eq('act_id', actId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  type Row = Omit<TourSearchResult, 'memberCount' | 'creator'> & {
    creator: { display_name: string | null } | null;
    members: { count: number }[] | null;
  };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    title: row.title,
    start_date: row.start_date,
    end_date: row.end_date,
    created_at: row.created_at,
    act: row.act,
    creator: row.creator ?? null,
    memberCount: row.members?.[0]?.count ?? 0,
  }));
}
