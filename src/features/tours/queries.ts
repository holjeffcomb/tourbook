import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthContext';
import { createTour, getTour, listTours, type CreateTourInput } from '@/features/tours/api';

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
