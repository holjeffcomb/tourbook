import type { CreateTourInput, MyTour, UpdateTourInput } from '@/features/tours/api';

// Pure helpers for optimistically patching the cached tours list (queryKeys.tours.all,
// a MyTour[]). Kept side-effect-free for easy unit testing and reuse across the
// offline tour mutations.

// `listMemberTours` returns newest-first (created_at desc); keep that order so the
// optimistic list matches what a refetch will produce.
function byCreatedDesc(a: MyTour, b: MyTour): number {
  return a.created_at < b.created_at ? 1 : -1;
}

// Insert or replace (matched by id) then re-sort. Replacing by id keeps replay
// idempotent: the optimistic tour and the synced tour (same client id) collapse.
export function upsertTour(list: MyTour[] | undefined, tour: MyTour): MyTour[] {
  const base = (list ?? []).filter((t) => t.id !== tour.id);
  return [tour, ...base].sort(byCreatedDesc);
}

export function removeTour(list: MyTour[] | undefined, id: string): MyTour[] {
  return (list ?? []).filter((t) => t.id !== id);
}

export function mapTour(
  list: MyTour[] | undefined,
  id: string,
  fn: (tour: MyTour) => MyTour,
): MyTour[] {
  return (list ?? []).map((t) => (t.id === id ? fn(t) : t));
}

// Optimistic MyTour for an offline tour create. When the act is new (no id yet),
// use a per-tour provisional act id — the real act id is resolved server-side and
// reconciled by the post-sync refetch; only the tour list's display name matters
// before then.
export function createTourVarsToMyTour(vars: CreateTourInput & { id: string }): MyTour {
  return {
    id: vars.id,
    title: vars.title?.trim() || null,
    start_date: vars.startDate ?? null,
    end_date: vars.endDate ?? null,
    visibility: vars.visibility ?? 'private',
    created_at: new Date().toISOString(),
    created_by: vars.userId,
    act: { id: vars.actId ?? `pending:${vars.id}`, name: vars.actName.trim() },
    myRole: vars.role?.trim() || null,
  };
}

export function applyTourUpdate(existing: MyTour, vars: UpdateTourInput): MyTour {
  return {
    ...existing,
    title: vars.title?.trim() || null,
    start_date: vars.startDate ?? null,
    end_date: vars.endDate ?? null,
    visibility: vars.visibility ?? existing.visibility,
    act: { ...existing.act, name: vars.actName.trim() },
    myRole: vars.role === undefined ? existing.myRole : vars.role?.trim() || null,
  };
}
