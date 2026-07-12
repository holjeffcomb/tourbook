import { supabase } from '@/lib/supabase';
import type { Profile } from '@/features/profile/api';

export type FriendshipStatus = 'pending' | 'accepted' | 'declined';

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  updated_at: string;
};

export type FriendshipWithProfile = Friendship & {
  other: Profile;
  direction: 'outgoing' | 'incoming';
};

const friendshipSelect = 'id, requester_id, addressee_id, status, created_at, updated_at';

function otherId(row: Friendship, userId: string) {
  return row.requester_id === userId ? row.addressee_id : row.requester_id;
}

async function attachProfiles(
  rows: Friendship[],
  userId: string,
): Promise<FriendshipWithProfile[]> {
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((r) => otherId(r, userId)))];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, username, bio, default_role')
    .in('id', ids);
  if (error) throw error;
  const byId = new Map((data ?? []).map((p) => [p.id, p as Profile]));

  return rows
    .map((row) => {
      const other = byId.get(otherId(row, userId));
      if (!other) return null;
      return {
        ...row,
        other,
        direction: (row.requester_id === userId ? 'outgoing' : 'incoming') as
          | 'outgoing'
          | 'incoming',
      };
    })
    .filter((r): r is FriendshipWithProfile => r != null);
}

export async function listFriends(userId: string): Promise<FriendshipWithProfile[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select(friendshipSelect)
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  if (error) throw error;
  return attachProfiles((data ?? []) as Friendship[], userId);
}

export async function listPendingFriendships(userId: string): Promise<FriendshipWithProfile[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select(friendshipSelect)
    .eq('status', 'pending')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  if (error) throw error;
  return attachProfiles((data ?? []) as Friendship[], userId);
}

export async function getFriendshipBetween(
  userId: string,
  otherUserId: string,
): Promise<Friendship | null> {
  const { data, error } = await supabase
    .from('friendships')
    .select(friendshipSelect)
    .or(
      `and(requester_id.eq.${userId},addressee_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},addressee_id.eq.${userId})`,
    )
    .maybeSingle();
  if (error) throw error;
  return (data as Friendship | null) ?? null;
}

export async function areFriends(userId: string, otherUserId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_friends', { a: userId, b: otherUserId });
  if (error) throw error;
  return !!data;
}

export async function sendFriendRequest(requesterId: string, addresseeId: string): Promise<void> {
  if (requesterId === addresseeId) throw new Error('You cannot friend yourself');

  const existing = await getFriendshipBetween(requesterId, addresseeId);
  if (existing?.status === 'accepted') throw new Error('You are already friends');
  if (existing?.status === 'pending') throw new Error('A request is already pending');

  if (existing?.status === 'declined') {
    // Re-request: reset to pending with current user as requester.
    const { error } = await supabase
      .from('friendships')
      .update({
        requester_id: requesterId,
        addressee_id: addresseeId,
        status: 'pending',
      })
      .eq('id', existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('friendships').insert({
    requester_id: requesterId,
    addressee_id: addresseeId,
    status: 'pending',
  });
  if (error) throw error;
}

export async function acceptFriendRequest(friendshipId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId)
    .eq('addressee_id', userId)
    .eq('status', 'pending');
  if (error) throw error;
}

export async function declineFriendRequest(friendshipId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'declined' })
    .eq('id', friendshipId)
    .eq('addressee_id', userId)
    .eq('status', 'pending');
  if (error) throw error;
}

export async function cancelFriendRequest(friendshipId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
    .eq('requester_id', userId)
    .eq('status', 'pending');
  if (error) throw error;
}

export async function unfriend(friendshipId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq('status', 'accepted');
  if (error) throw error;
}

/** Tours the viewer can see for another user (RLS-filtered memberships). */
export async function listVisibleToursForUser(userId: string) {
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
    .filter((row) => row.tour)
    .map((row) => ({ ...row.tour!, myRole: row.role }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
