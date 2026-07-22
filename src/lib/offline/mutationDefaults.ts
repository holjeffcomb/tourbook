import type { QueryClient, QueryKey } from '@tanstack/react-query';
import {
  createOffDay,
  createShow,
  deleteStop,
  updateOffDay,
  updateShow,
  type CreateOffDayInput,
  type CreateShowInput,
  type TourStop,
  type UpdateOffDayInput,
  type UpdateShowInput,
} from '@/features/shows/api';
import {
  applyOffDayUpdate,
  applyShowUpdate,
  insertStop,
  mapStop,
  offDayVarsToStop,
  removeStop,
  showVarsToStop,
} from '@/features/shows/optimistic';
import { createTour, deleteTour, updateTour, type CreateTourInput, type MyTour, type UpdateTourInput } from '@/features/tours/api';
import { applyTourUpdate, createTourVarsToMyTour, mapTour, removeTour, upsertTour } from '@/features/tours/optimistic';
import { cancelPausedCreatesForId } from '@/lib/offline/dequeue';
import { mutationKeys, queryKeys } from '@/lib/queryKeys';

// Every offline-capable mutation's `mutationFn` + optimistic/rollback/invalidation
// handlers, keyed by a stable mutationKey. This MUST run before
// `resumePausedMutations()`: a persisted mutation stores only its key + variables,
// so the function that performs the write and re-applies the optimistic update
// lives here, not on disk. Components call `useMutation({ mutationKey })` and
// inherit these. Mutation variables are always self-contained (carry userId,
// tourId, and the client id) so replay works with no React context.

// --- Variable shapes (self-contained; carry everything replay needs) ----------
export type CreateOffDayVars = CreateOffDayInput & { id: string };
export type CreateShowVars = CreateShowInput & { id: string };
export type UpdateShowVars = UpdateShowInput & { tourId: string };
export type UpdateOffDayVars = UpdateOffDayInput & { tourId: string };
export type DeleteStopVars = { stopId: string; tourId: string; userId: string };
export type CreateTourVars = CreateTourInput & { id: string };
export type UpdateTourVars = UpdateTourInput;
export type DeleteTourVars = { tourId: string; userId: string };

// Snapshot for single-cache optimistic rollback.
type Snapshot = { key: QueryKey; previous: unknown };

// --- Small optimistic helpers -------------------------------------------------
async function beginOptimistic<T>(
  queryClient: QueryClient,
  key: QueryKey,
  updater: (old: T | undefined) => T,
): Promise<Snapshot> {
  await queryClient.cancelQueries({ queryKey: key });
  const previous = queryClient.getQueryData<T>(key);
  queryClient.setQueryData<T>(key, (old) => updater(old));
  return { key, previous };
}

function rollback(queryClient: QueryClient, context: unknown) {
  const snapshot = context as Snapshot | undefined;
  if (snapshot) queryClient.setQueryData(snapshot.key, snapshot.previous);
}

function invalidateCrossings(queryClient: QueryClient, userId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.friends.crossings(userId) });
}

// The create-key set a deleted stop/tour might still have queued (used to dequeue
// a paused create when its row is deleted before syncing — see dequeue.ts).
const STOP_CREATE_KEYS = [mutationKeys.shows.create, mutationKeys.offDays.create] as const;
const TOUR_CREATE_KEYS = [mutationKeys.tours.create] as const;

let registered = false;

export function registerMutationDefaults(queryClient: QueryClient): void {
  if (registered) return;
  registered = true;

  const stops = (tourId: string) => queryKeys.shows.list(tourId);

  // --- Off day: create ---------------------------------------------------------
  queryClient.setMutationDefaults(mutationKeys.offDays.create, {
    mutationFn: (vars: CreateOffDayVars) => createOffDay(vars),
    onMutate: (vars: CreateOffDayVars) =>
      beginOptimistic<TourStop[]>(queryClient, stops(vars.tourId), (old) =>
        insertStop(old, offDayVarsToStop(vars)),
      ),
    onError: (_e, _vars, context) => rollback(queryClient, context),
    onSettled: (_d, _e, vars) => {
      void queryClient.invalidateQueries({ queryKey: stops((vars as CreateOffDayVars).tourId) });
      invalidateCrossings(queryClient, (vars as CreateOffDayVars).userId);
    },
  });

  // --- Off day: update ---------------------------------------------------------
  queryClient.setMutationDefaults(mutationKeys.offDays.update, {
    mutationFn: (vars: UpdateOffDayVars) => updateOffDay(vars),
    onMutate: (vars: UpdateOffDayVars) =>
      beginOptimistic<TourStop[]>(queryClient, stops(vars.tourId), (old) =>
        mapStop(old, vars.stopId, (s) => applyOffDayUpdate(s, vars)),
      ),
    onError: (_e, _vars, context) => rollback(queryClient, context),
    onSettled: (_d, _e, vars) => {
      const v = vars as UpdateOffDayVars;
      void queryClient.invalidateQueries({ queryKey: stops(v.tourId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.shows.detail(v.stopId) });
      invalidateCrossings(queryClient, v.userId);
    },
  });

  // --- Show: create ------------------------------------------------------------
  queryClient.setMutationDefaults(mutationKeys.shows.create, {
    mutationFn: (vars: CreateShowVars) => createShow(vars),
    onMutate: (vars: CreateShowVars) =>
      beginOptimistic<TourStop[]>(queryClient, stops(vars.tourId), (old) =>
        insertStop(old, showVarsToStop(vars)),
      ),
    onError: (_e, _vars, context) => rollback(queryClient, context),
    onSettled: (_d, _e, vars) => {
      void queryClient.invalidateQueries({ queryKey: stops((vars as CreateShowVars).tourId) });
      invalidateCrossings(queryClient, (vars as CreateShowVars).userId);
    },
  });

  // --- Show: update ------------------------------------------------------------
  queryClient.setMutationDefaults(mutationKeys.shows.update, {
    mutationFn: (vars: UpdateShowVars) => updateShow(vars),
    onMutate: (vars: UpdateShowVars) =>
      beginOptimistic<TourStop[]>(queryClient, stops(vars.tourId), (old) =>
        mapStop(old, vars.showId, (s) => applyShowUpdate(s, vars)),
      ),
    onError: (_e, _vars, context) => rollback(queryClient, context),
    onSettled: (_d, _e, vars) => {
      const v = vars as UpdateShowVars;
      void queryClient.invalidateQueries({ queryKey: stops(v.tourId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.shows.detail(v.showId) });
      invalidateCrossings(queryClient, v.userId);
    },
  });

  // --- Stop: delete (show or off day) ------------------------------------------
  queryClient.setMutationDefaults(mutationKeys.stops.delete, {
    mutationFn: (vars: DeleteStopVars) => deleteStop(vars.stopId),
    onMutate: (vars: DeleteStopVars) => {
      // If this stop's create is still queued (never synced), drop it so replay
      // doesn't resurrect the row. Idempotent delete-by-id is the safety net.
      cancelPausedCreatesForId(queryClient, STOP_CREATE_KEYS, vars.stopId);
      return beginOptimistic<TourStop[]>(queryClient, stops(vars.tourId), (old) =>
        removeStop(old, vars.stopId),
      );
    },
    onError: (_e, _vars, context) => rollback(queryClient, context),
    onSettled: (_d, _e, vars) => {
      const v = vars as DeleteStopVars;
      void queryClient.invalidateQueries({ queryKey: stops(v.tourId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.shows.detail(v.stopId) });
      invalidateCrossings(queryClient, v.userId);
    },
  });

  // --- Tour: create (transactional RPC) ----------------------------------------
  queryClient.setMutationDefaults(mutationKeys.tours.create, {
    mutationFn: (vars: CreateTourVars) => createTour(vars),
    onMutate: (vars: CreateTourVars) =>
      beginOptimistic<MyTour[]>(queryClient, queryKeys.tours.all, (old) =>
        upsertTour(old, createTourVarsToMyTour(vars)),
      ),
    onError: (_e, _vars, context) => rollback(queryClient, context),
    onSettled: (_d, _e, vars) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tours.all });
      invalidateCrossings(queryClient, (vars as CreateTourVars).userId);
    },
  });

  // --- Tour: update (transactional RPC) ----------------------------------------
  queryClient.setMutationDefaults(mutationKeys.tours.update, {
    mutationFn: (vars: UpdateTourVars) => updateTour(vars),
    onMutate: (vars: UpdateTourVars) =>
      beginOptimistic<MyTour[]>(queryClient, queryKeys.tours.all, (old) =>
        mapTour(old, vars.tourId, (t) => applyTourUpdate(t, vars)),
      ),
    onError: (_e, _vars, context) => rollback(queryClient, context),
    onSettled: (_d, _e, vars) => {
      const v = vars as UpdateTourVars;
      void queryClient.invalidateQueries({ queryKey: queryKeys.tours.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tours.detail(v.tourId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tours.membership(v.tourId) });
      invalidateCrossings(queryClient, v.userId);
    },
  });

  // --- Tour: delete ------------------------------------------------------------
  queryClient.setMutationDefaults(mutationKeys.tours.delete, {
    mutationFn: (vars: DeleteTourVars) => deleteTour(vars.tourId),
    onMutate: (vars: DeleteTourVars) => {
      cancelPausedCreatesForId(queryClient, TOUR_CREATE_KEYS, vars.tourId);
      return beginOptimistic<MyTour[]>(queryClient, queryKeys.tours.all, (old) =>
        removeTour(old, vars.tourId),
      );
    },
    onError: (_e, _vars, context) => rollback(queryClient, context),
    onSettled: (_d, _e, vars) => {
      const v = vars as DeleteTourVars;
      // Tour + its stops/members are gone (ON DELETE CASCADE); drop those caches too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.tours.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tours.detail(v.tourId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tours.membership(v.tourId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tours.members(v.tourId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.shows.list(v.tourId) });
      invalidateCrossings(queryClient, v.userId);
    },
  });
}
