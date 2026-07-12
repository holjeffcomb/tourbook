import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthContext';
import {
  acceptFriendRequest,
  areFriends,
  cancelFriendRequest,
  declineFriendRequest,
  getFriendshipBetween,
  listFriends,
  listPendingFriendships,
  listVisibleToursForUser,
  sendFriendRequest,
  unfriend,
} from '@/features/social/api';

export const friendsKey = (userId: string) => ['friends', userId] as const;
export const pendingFriendsKey = (userId: string) => ['friends', userId, 'pending'] as const;
export const friendshipKey = (a: string, b: string) => ['friendship', a, b] as const;
export const visibleToursKey = (userId: string) => ['profile', userId, 'visible-tours'] as const;

function invalidateSocial(queryClient: ReturnType<typeof useQueryClient>, userId: string) {
  queryClient.invalidateQueries({ queryKey: friendsKey(userId) });
  queryClient.invalidateQueries({ queryKey: pendingFriendsKey(userId) });
  queryClient.invalidateQueries({ queryKey: ['friendship'] });
}

export function useFriends() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: friendsKey(userId ?? 'anonymous'),
    queryFn: () => listFriends(userId as string),
    enabled: !!userId,
  });
}

export function usePendingFriendships() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: pendingFriendsKey(userId ?? 'anonymous'),
    queryFn: () => listPendingFriendships(userId as string),
    enabled: !!userId,
  });
}

export function useFriendshipWith(otherUserId: string) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: friendshipKey(userId ?? 'anonymous', otherUserId),
    queryFn: () => getFriendshipBetween(userId as string, otherUserId),
    enabled: !!userId && !!otherUserId && userId !== otherUserId,
  });
}

export function useAreFriends(otherUserId: string) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: [...friendshipKey(userId ?? 'anonymous', otherUserId), 'rpc'],
    queryFn: () => areFriends(userId as string, otherUserId),
    enabled: !!userId && !!otherUserId && userId !== otherUserId,
  });
}

export function useVisibleToursForUser(userId: string, enabled = true) {
  return useQuery({
    queryKey: visibleToursKey(userId),
    queryFn: () => listVisibleToursForUser(userId),
    enabled: !!userId && enabled,
  });
}

export function useSendFriendRequest() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: (addresseeId: string) => {
      if (!session) throw new Error('You must be signed in');
      return sendFriendRequest(session.user.id, addresseeId);
    },
    onSuccess: (_data, addresseeId) => {
      if (!session) return;
      invalidateSocial(queryClient, session.user.id);
      queryClient.invalidateQueries({
        queryKey: friendshipKey(session.user.id, addresseeId),
      });
    },
  });
}

export function useAcceptFriendRequest() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: (friendshipId: string) => {
      if (!session) throw new Error('You must be signed in');
      return acceptFriendRequest(friendshipId, session.user.id);
    },
    onSuccess: () => {
      if (session) invalidateSocial(queryClient, session.user.id);
    },
  });
}

export function useDeclineFriendRequest() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: (friendshipId: string) => {
      if (!session) throw new Error('You must be signed in');
      return declineFriendRequest(friendshipId, session.user.id);
    },
    onSuccess: () => {
      if (session) invalidateSocial(queryClient, session.user.id);
    },
  });
}

export function useCancelFriendRequest() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: (friendshipId: string) => {
      if (!session) throw new Error('You must be signed in');
      return cancelFriendRequest(friendshipId, session.user.id);
    },
    onSuccess: () => {
      if (session) invalidateSocial(queryClient, session.user.id);
    },
  });
}

export function useUnfriend() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: (friendshipId: string) => {
      if (!session) throw new Error('You must be signed in');
      return unfriend(friendshipId, session.user.id);
    },
    onSuccess: () => {
      if (session) invalidateSocial(queryClient, session.user.id);
    },
  });
}
