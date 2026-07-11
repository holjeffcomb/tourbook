import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthContext';
import { createShow, listShows, type CreateShowInput } from '@/features/shows/api';

export const showsKey = (tourId: string) => ['shows', tourId] as const;

export function useShows(tourId: string) {
  return useQuery({
    queryKey: showsKey(tourId),
    queryFn: () => listShows(tourId),
  });
}

export function useCreateShow(tourId: string) {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: (values: Omit<CreateShowInput, 'userId' | 'tourId'>) => {
      if (!session) throw new Error('You must be signed in to add a show');
      return createShow({ ...values, tourId, userId: session.user.id });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: showsKey(tourId) }),
  });
}
