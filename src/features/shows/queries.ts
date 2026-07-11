import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthContext';
import {
  createShow,
  deleteShow,
  getShow,
  listShows,
  updateShow,
  type CreateShowInput,
  type UpdateShowInput,
} from '@/features/shows/api';

export const showsKey = (tourId: string) => ['shows', tourId] as const;
export const showKey = (showId: string) => ['show', showId] as const;

export function useShows(tourId: string) {
  return useQuery({
    queryKey: showsKey(tourId),
    queryFn: () => listShows(tourId),
  });
}

export function useShow(showId: string) {
  return useQuery({
    queryKey: showKey(showId),
    queryFn: () => getShow(showId),
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

export function useUpdateShow(tourId: string, showId: string) {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: (values: Omit<UpdateShowInput, 'userId' | 'showId'>) => {
      if (!session) throw new Error('You must be signed in to edit a show');
      return updateShow({ ...values, showId, userId: session.user.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: showsKey(tourId) });
      queryClient.invalidateQueries({ queryKey: showKey(showId) });
    },
  });
}

export function useDeleteShow(tourId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (showId: string) => deleteShow(showId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: showsKey(tourId) }),
  });
}
