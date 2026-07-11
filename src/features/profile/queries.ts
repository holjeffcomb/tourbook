import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthContext';
import { getProfile, updateProfile } from '@/features/profile/api';

export const profileKey = (userId: string) => ['profile', userId] as const;

export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: profileKey(userId ?? 'anonymous'),
    queryFn: () => getProfile(userId as string),
    enabled: !!userId,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: (displayName: string) => {
      if (!session) throw new Error('You must be signed in to update your profile');
      return updateProfile(session.user.id, displayName);
    },
    onSuccess: () => {
      if (session) queryClient.invalidateQueries({ queryKey: profileKey(session.user.id) });
    },
  });
}
