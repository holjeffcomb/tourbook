import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthContext';
import {
  getProfile,
  listPublicToursForUser,
  searchProfiles,
  updateProfile,
  type ProfileUpdate,
} from '@/features/profile/api';

export const profileKey = (userId: string) => ['profile', userId] as const;
export const profileSearchKey = (term: string) => ['profiles', 'search', term] as const;
export const publicToursKey = (userId: string) => ['profile', userId, 'public-tours'] as const;

export function useProfile(userId?: string) {
  const { session } = useAuth();
  const id = userId ?? session?.user.id;

  return useQuery({
    queryKey: profileKey(id ?? 'anonymous'),
    queryFn: () => getProfile(id as string),
    enabled: !!id,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: (values: ProfileUpdate) => {
      if (!session) throw new Error('You must be signed in to update your profile');
      return updateProfile(session.user.id, values);
    },
    onSuccess: () => {
      if (session) queryClient.invalidateQueries({ queryKey: profileKey(session.user.id) });
    },
  });
}

export function useProfileSearch(term: string) {
  const { session } = useAuth();
  const trimmed = term.trim();

  return useQuery({
    queryKey: profileSearchKey(trimmed),
    queryFn: () => searchProfiles(trimmed, session?.user.id),
    enabled: trimmed.length >= 2,
    staleTime: 30_000,
  });
}

export function usePublicToursForUser(userId: string) {
  return useQuery({
    queryKey: publicToursKey(userId),
    queryFn: () => listPublicToursForUser(userId),
    enabled: !!userId,
  });
}
