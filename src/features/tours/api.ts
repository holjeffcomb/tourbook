import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { newId } from '@/lib/uuid';

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

export const tourSelect =
  'id, title, start_date, end_date, visibility, created_at, created_by, act:acts(id, name)';

/**
 * Loads the tours a user is a member of, annotated with their role. Used for the
 * current user (all their tours) and for other users (RLS narrows the rows to
 * what the viewer may see). Single source of truth so the tour-list shape can't drift.
 */
export async function listMemberTours(userId: string): Promise<MyTour[]> {
  const { data, error } = await supabase
    .from('tour_members')
    .select(`role, tour:tours(${tourSelect})`)
    .eq('user_id', userId);
  if (error) throw error;

  const rows = (data ?? []) as unknown as { role: string | null; tour: TourWithAct | null }[];
  return rows
    .filter((row) => row.tour)
    .map((row) => ({ ...(row.tour as TourWithAct), myRole: row.role }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function listMyTours(userId: string): Promise<MyTour[]> {
  return listMemberTours(userId);
}

export async function getTour(id: string): Promise<TourWithAct> {
  const { data, error } = await supabase.from('tours').select(tourSelect).eq('id', id).single();
  if (error) throw error;
  return data as unknown as TourWithAct;
}

export type CreateTourInput = {
  // Client-generated tour id; makes offline replay idempotent (also used to
  // navigate to the new tour before it syncs).
  id?: string;
  userId: string;
  actName: string;
  // When the user picked an existing act, its id is carried through so the tour
  // ties to that exact act instead of re-deduping (or forking) by name.
  actId?: string | null;
  role?: string;
  title?: string;
  startDate?: string | null;
  endDate?: string | null;
  visibility?: TourVisibility;
};

// Creates the tour + the creator's membership in ONE server-side transaction via
// the create_tour_with_membership RPC. A plain two-insert sequence could leave a
// partial record (tour with no membership) if interrupted mid-replay; the RPC is
// all-or-nothing and idempotent on the client-generated id. Act resolution also
// happens server-side so the whole action is offline-replayable (no client
// getOrCreateAct network call). See docs/design/offline-write-support.md.
export async function createTour(input: CreateTourInput): Promise<{ id: string }> {
  const tourId = input.id ?? newId();
  const { data, error } = await supabase.rpc('create_tour_with_membership', {
    p_tour_id: tourId,
    p_act_id: input.actId ?? null,
    p_act_name: input.actName,
    p_title: input.title ?? null,
    p_start_date: input.startDate ?? null,
    p_end_date: input.endDate ?? null,
    // Default Private ('public' is retired — see docs/design/social-model.md).
    p_visibility: input.visibility ?? 'private',
    p_role: input.role ?? null,
  });
  if (error) throw error;
  return { id: (data as string | null) ?? tourId };
}

export type UpdateTourInput = {
  userId: string;
  tourId: string;
  actName: string;
  title?: string;
  startDate?: string | null;
  endDate?: string | null;
  visibility?: TourVisibility;
  // The caller's own role on the tour, updated in the same transaction.
  role?: string | null;
};

// Updates the shared tour's details + the caller's role atomically via the
// update_tour_with_role RPC (only the creator may change the tour; enforced in the
// function). Act resolution is server-side so the edit is offline-replayable.
export async function updateTour(input: UpdateTourInput): Promise<void> {
  const { error } = await supabase.rpc('update_tour_with_role', {
    p_tour_id: input.tourId,
    p_act_name: input.actName,
    p_title: input.title ?? null,
    p_start_date: input.startDate ?? null,
    p_end_date: input.endDate ?? null,
    // null → keep the tour's current visibility (coalesced server-side).
    p_visibility: input.visibility ?? null,
    p_role: input.role ?? null,
  });
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
//
// Goes through the `search_tours_by_act` catalog RPC (SECURITY DEFINER) rather than a direct
// `tours` read: under the social model tours are Private/Connections, so a direct read would
// hide tours the viewer isn't already on and silently reintroduce duplicates. The RPC exposes
// only non-sensitive catalog metadata (existence, title, dates, member count) and gates the
// creator's name to tours the viewer may already see — no roster enumeration.
export async function searchToursByAct(actId: string): Promise<TourSearchResult[]> {
  const { data, error } = await supabase.rpc('search_tours_by_act', { p_act_id: actId });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    start_date: row.start_date,
    end_date: row.end_date,
    created_at: row.created_at,
    act: { id: row.act_id, name: row.act_name },
    creator: row.creator_display_name ? { display_name: row.creator_display_name } : null,
    memberCount: row.member_count ?? 0,
  }));
}
