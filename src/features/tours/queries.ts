import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthContext';
import {
  createTour,
  deleteTour,
  getTour,
  listTours,
  updateTour,
  type CreateTourInput,
  type UpdateTourInput,
} from '@/features/tours/api';

export const toursKey = ['tours'] as const;
export const tourKey = (id: string) => ['tours', id] as const;

export function useTours() {
  return useQuery({
    queryKey: toursKey,
    queryFn: listTours,
  });
}

export function useTour(id: string) {
  return useQuery({
    queryKey: tourKey(id),
    queryFn: () => getTour(id),
  });
}

export function useCreateTour() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: (values: Omit<CreateTourInput, 'userId'>) => {
      if (!session) throw new Error('You must be signed in to create a tour');
      return createTour({ ...values, userId: session.user.id });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: toursKey }),
  });
}

export function useUpdateTour(tourId: string) {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: (values: Omit<UpdateTourInput, 'userId' | 'tourId'>) => {
      if (!session) throw new Error('You must be signed in to edit a tour');
      return updateTour({ ...values, tourId, userId: session.user.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toursKey });
      queryClient.invalidateQueries({ queryKey: tourKey(tourId) });
    },
  });
}

export function useDeleteTour() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tourId: string) => deleteTour(tourId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: toursKey }),
  });
}
