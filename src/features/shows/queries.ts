import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthContext';
import type {
  CreateOffDayVars,
  CreateShowVars,
  DeleteStopVars,
  UpdateOffDayVars,
  UpdateShowVars,
} from '@/lib/offline/mutationDefaults';
import { mutationKeys, queryKeys } from '@/lib/queryKeys';
import { newId } from '@/lib/uuid';
import {
  getStop,
  listStops,
  type CreateOffDayInput,
  type CreateShowInput,
  type UpdateOffDayInput,
  type UpdateShowInput,
} from '@/features/shows/api';

export const showsKey = queryKeys.shows.list;
export const showKey = queryKeys.shows.detail;

// These mutations are offline-capable: the `mutationFn` and optimistic / rollback /
// invalidation handlers live in `registerMutationDefaults`, keyed by a stable
// `mutationKey`, so the exact same behavior runs whether the write happens live or
// is replayed from disk after a cold start. Each hook only builds the
// self-contained variables (client id + userId + tourId) the queued mutation needs.
//
// `submit()` fires the mutation and returns WITHOUT awaiting the network: offline,
// TanStack pauses the mutation and the promise wouldn't resolve until reconnect, so
// awaiting would block navigation. Callers navigate immediately; the optimistic
// update (and rollback on failure) keeps the UI correct. Creates return the client
// id so the caller can navigate to the new row before it syncs.

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

type CreateShowValues = Omit<CreateShowInput, 'userId' | 'tourId' | 'id'>;
type CreateOffDayValues = Omit<CreateOffDayInput, 'userId' | 'tourId' | 'id'>;
type UpdateShowValues = Omit<UpdateShowInput, 'userId' | 'showId'>;
type UpdateOffDayValues = Omit<UpdateOffDayInput, 'userId' | 'stopId'>;

export function useCreateShow(tourId: string) {
  const { session } = useAuth();
  const mutation = useMutation<{ id: string }, Error, CreateShowVars>({
    mutationKey: mutationKeys.shows.create,
  });
  return {
    ...mutation,
    submit: (values: CreateShowValues): string => {
      if (!session) throw new Error('You must be signed in to add a show');
      const vars: CreateShowVars = { ...values, tourId, userId: session.user.id, id: newId() };
      mutation.mutate(vars);
      return vars.id;
    },
  };
}

export function useUpdateShow(tourId: string, showId: string) {
  const { session } = useAuth();
  const mutation = useMutation<void, Error, UpdateShowVars>({
    mutationKey: mutationKeys.shows.update,
  });
  return {
    ...mutation,
    submit: (values: UpdateShowValues) => {
      if (!session) throw new Error('You must be signed in to edit a show');
      mutation.mutate({ ...values, showId, tourId, userId: session.user.id });
    },
  };
}

export function useCreateOffDay(tourId: string) {
  const { session } = useAuth();
  const mutation = useMutation<{ id: string }, Error, CreateOffDayVars>({
    mutationKey: mutationKeys.offDays.create,
  });
  return {
    ...mutation,
    submit: (values: CreateOffDayValues): string => {
      if (!session) throw new Error('You must be signed in to add an off day');
      const vars: CreateOffDayVars = { ...values, tourId, userId: session.user.id, id: newId() };
      mutation.mutate(vars);
      return vars.id;
    },
  };
}

export function useUpdateOffDay(tourId: string, stopId: string) {
  const { session } = useAuth();
  const mutation = useMutation<void, Error, UpdateOffDayVars>({
    mutationKey: mutationKeys.offDays.update,
  });
  return {
    ...mutation,
    submit: (values: UpdateOffDayValues) => {
      if (!session) throw new Error('You must be signed in to edit an off day');
      mutation.mutate({ ...values, stopId, tourId, userId: session.user.id });
    },
  };
}

export function useDeleteStop(tourId: string) {
  const { session } = useAuth();
  const mutation = useMutation<void, Error, DeleteStopVars>({
    mutationKey: mutationKeys.stops.delete,
  });
  return {
    ...mutation,
    submit: (stopId: string) => {
      if (!session) throw new Error('You must be signed in to delete this stop');
      mutation.mutate({ stopId, tourId, userId: session.user.id });
    },
  };
}
