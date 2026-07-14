import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthContext';
import {
  createTour,
  deleteTour,
  getMyMembership,
  getTour,
  joinTour,
  leaveTour,
  listMyTours,
  listTourMembers,
  searchToursByAct,
  updateMyRole,
  updateTour,
  type CreateTourInput,
} from '@/features/tours/api';
import {
  createImportedTour,
  parseTourText,
  type ImportStop,
  type ParsedTour,
} from '@/features/tours/import';

export const toursKey = ['tours'] as const;
export const tourKey = (id: string) => ['tours', id] as const;
export const membershipKey = (tourId: string) => ['tours', tourId, 'membership'] as const;
export const membersKey = (tourId: string) => ['tours', tourId, 'members'] as const;
export const tourSearchKey = (actId: string) => ['tours', 'search', actId] as const;

export function useTours() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: toursKey,
    queryFn: () => listMyTours(userId as string),
    enabled: !!userId,
  });
}

export function useTour(id: string) {
  return useQuery({
    queryKey: tourKey(id),
    queryFn: () => getTour(id),
  });
}

export function useMyMembership(tourId: string) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: membershipKey(tourId),
    queryFn: () => getMyMembership(tourId, userId as string),
    enabled: !!userId,
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

type UpdateTourValues = {
  actName: string;
  role?: string;
  title?: string;
  startDate?: string | null;
  endDate?: string | null;
  visibility?: 'public' | 'friends' | 'private';
};

export function useUpdateTour(tourId: string) {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (values: UpdateTourValues) => {
      if (!session) throw new Error('You must be signed in to edit a tour');
      await updateTour({
        tourId,
        userId: session.user.id,
        actName: values.actName,
        title: values.title,
        startDate: values.startDate,
        endDate: values.endDate,
        visibility: values.visibility,
      });
      await updateMyRole(tourId, session.user.id, values.role ?? null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toursKey });
      queryClient.invalidateQueries({ queryKey: tourKey(tourId) });
      queryClient.invalidateQueries({ queryKey: membershipKey(tourId) });
    },
  });
}

export function useParseTour() {
  return useMutation<ParsedTour, Error, string>({
    mutationFn: (text: string) => parseTourText(text),
  });
}

export function useCreateImportedTour() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: (values: {
      actName: string;
      actId?: string | null;
      tourTitle: string | null;
      stops: ImportStop[];
    }) => {
      if (!session) throw new Error('You must be signed in to import a tour');
      return createImportedTour({ ...values, userId: session.user.id });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: toursKey }),
  });
}

export function useDeleteTour() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tourId: string) => deleteTour(tourId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: toursKey }),
  });
}

export function useTourMembers(tourId: string) {
  return useQuery({
    queryKey: membersKey(tourId),
    queryFn: () => listTourMembers(tourId),
  });
}

export function useTourSearch(actId: string | null) {
  return useQuery({
    queryKey: tourSearchKey(actId ?? 'none'),
    queryFn: () => searchToursByAct(actId as string),
    enabled: !!actId,
    staleTime: 30_000,
  });
}

function useInvalidateMembership(tourId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: toursKey });
    queryClient.invalidateQueries({ queryKey: membershipKey(tourId) });
    queryClient.invalidateQueries({ queryKey: membersKey(tourId) });
  };
}

export function useJoinTour(tourId: string) {
  const { session } = useAuth();
  const invalidate = useInvalidateMembership(tourId);

  return useMutation({
    mutationFn: (role?: string) => {
      if (!session) throw new Error('You must be signed in to join a tour');
      return joinTour(tourId, session.user.id, role ?? null);
    },
    onSuccess: invalidate,
  });
}

// Join by id from the discovery list, where the tour isn't fixed at hook time.
export function useJoinTourById() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: (tourId: string) => {
      if (!session) throw new Error('You must be signed in to join a tour');
      return joinTour(tourId, session.user.id, null);
    },
    onSuccess: (_data, tourId) => {
      queryClient.invalidateQueries({ queryKey: toursKey });
      queryClient.invalidateQueries({ queryKey: membershipKey(tourId) });
      queryClient.invalidateQueries({ queryKey: membersKey(tourId) });
    },
  });
}

export function useLeaveTour(tourId: string) {
  const { session } = useAuth();
  const invalidate = useInvalidateMembership(tourId);

  return useMutation({
    mutationFn: () => {
      if (!session) throw new Error('You must be signed in to leave a tour');
      return leaveTour(tourId, session.user.id);
    },
    onSuccess: invalidate,
  });
}
