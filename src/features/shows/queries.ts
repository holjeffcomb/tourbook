import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import {
  createOffDay,
  createShow,
  deleteStop,
  getStop,
  listStops,
  updateOffDay,
  updateShow,
  type CreateOffDayInput,
  type CreateShowInput,
  type UpdateOffDayInput,
  type UpdateShowInput,
} from '@/features/shows/api';

export const showsKey = queryKeys.shows.list;
export const showKey = queryKeys.shows.detail;

export function useStops(tourId: string) {
  return useQuery({
    queryKey: showsKey(tourId),
    queryFn: () => listStops(tourId),
  });
}

export function useStop(stopId: string) {
  return useQuery({
    queryKey: showKey(stopId),
    queryFn: () => getStop(stopId),
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

export function useCreateOffDay(tourId: string) {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: (values: Omit<CreateOffDayInput, 'userId' | 'tourId'>) => {
      if (!session) throw new Error('You must be signed in to add an off day');
      return createOffDay({ ...values, tourId, userId: session.user.id });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: showsKey(tourId) }),
  });
}

export function useUpdateOffDay(tourId: string, stopId: string) {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: (values: Omit<UpdateOffDayInput, 'userId' | 'stopId'>) => {
      if (!session) throw new Error('You must be signed in to edit an off day');
      return updateOffDay({ ...values, stopId, userId: session.user.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: showsKey(tourId) });
      queryClient.invalidateQueries({ queryKey: showKey(stopId) });
    },
  });
}

export function useDeleteStop(tourId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (stopId: string) => deleteStop(stopId),
    onSuccess: (_data, stopId) => {
      queryClient.invalidateQueries({ queryKey: showsKey(tourId) });
      queryClient.invalidateQueries({ queryKey: showKey(stopId) });
    },
  });
}
