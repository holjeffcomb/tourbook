import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { pickActiveTour } from '@/features/tours/tourMode';
import { dateToISO } from '@/lib/date';
import type { CreateTourVars, DeleteTourVars, UpdateTourVars } from '@/lib/offline/mutationDefaults';
import { mutationKeys, queryKeys } from '@/lib/queryKeys';
import { newId } from '@/lib/uuid';
import {
  getMyMembership,
  getTour,
  joinTour,
  leaveTour,
  listMyTours,
  listTourMembers,
  searchToursByAct,
  type CreateTourInput,
  type TourVisibility,
} from '@/features/tours/api';
import {
  createImportedTour,
  parseTourText,
  type ImportStop,
  type ParsedTour,
} from '@/features/tours/import';

export const toursKey = queryKeys.tours.all;
export const tourKey = queryKeys.tours.detail;
export const membershipKey = queryKeys.tours.membership;
export const membersKey = queryKeys.tours.members;
export const tourSearchKey = queryKeys.tours.searchByAct;

// Changing my tours/memberships can change my server-computed crossed paths.
function invalidateCrossings(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string | undefined,
) {
  if (userId) queryClient.invalidateQueries({ queryKey: queryKeys.friends.crossings(userId) });
}

export function useTours() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: toursKey,
    queryFn: () => listMyTours(userId as string),
    enabled: !!userId,
  });
}

/**
 * Detects "Tour Mode": the tour (if any) whose dates contain today, so the app
 * can automatically focus the user on where they are right now. Derived from
 * `useTours` + the current date — no separate query or user toggle.
 */
export function useActiveTour() {
  const query = useTours();
  const todayISO = dateToISO(new Date());
  const activeTour = useMemo(
    () => (query.data ? pickActiveTour(query.data, todayISO) : null),
    [query.data, todayISO],
  );
  return { activeTour, todayISO, isLoading: query.isLoading };
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

// Offline-capable (transactional RPC + optimistic cache). Handlers live in
// `registerMutationDefaults` keyed by `mutationKeys.tours.*`; hooks build the
// self-contained variables. `submit()` fires without awaiting (see shows/queries.ts
// for why); create returns the client tour id so the caller can navigate immediately.
type CreateTourValues = Omit<CreateTourInput, 'userId' | 'id'>;

export function useCreateTour() {
  const { session } = useAuth();
  const mutation = useMutation<{ id: string }, Error, CreateTourVars>({
    mutationKey: mutationKeys.tours.create,
  });
  return {
    ...mutation,
    submit: (values: CreateTourValues): string => {
      if (!session) throw new Error('You must be signed in to create a tour');
      const vars: CreateTourVars = { ...values, userId: session.user.id, id: newId() };
      mutation.mutate(vars);
      return vars.id;
    },
  };
}

type UpdateTourValues = {
  actName: string;
  role?: string;
  title?: string;
  startDate?: string | null;
  endDate?: string | null;
  visibility?: TourVisibility;
};

export function useUpdateTour(tourId: string) {
  const { session } = useAuth();
  const mutation = useMutation<void, Error, UpdateTourVars>({
    mutationKey: mutationKeys.tours.update,
  });
  return {
    ...mutation,
    submit: (values: UpdateTourValues) => {
      if (!session) throw new Error('You must be signed in to edit a tour');
      mutation.mutate({
        tourId,
        userId: session.user.id,
        actName: values.actName,
        title: values.title,
        startDate: values.startDate,
        endDate: values.endDate,
        visibility: values.visibility,
        role: values.role ?? null,
      });
    },
  };
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: toursKey });
      invalidateCrossings(queryClient, session?.user.id);
    },
  });
}

export function useDeleteTour() {
  const { session } = useAuth();
  const mutation = useMutation<void, Error, DeleteTourVars>({
    mutationKey: mutationKeys.tours.delete,
  });
  return {
    ...mutation,
    submit: (tourId: string) => {
      if (!session) throw new Error('You must be signed in to delete a tour');
      mutation.mutate({ tourId, userId: session.user.id });
    },
  };
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
  const { session } = useAuth();
  return () => {
    queryClient.invalidateQueries({ queryKey: toursKey });
    queryClient.invalidateQueries({ queryKey: membershipKey(tourId) });
    queryClient.invalidateQueries({ queryKey: membersKey(tourId) });
    invalidateCrossings(queryClient, session?.user.id);
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
      invalidateCrossings(queryClient, session?.user.id);
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
