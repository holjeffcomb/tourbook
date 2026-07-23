import type {
  CreateOffDayInput,
  CreateShowInput,
  TourStop,
  UpdateOffDayInput,
  UpdateShowInput,
} from '@/features/shows/api';

// Pure helpers for optimistically patching a cached stops list. Kept pure (no
// QueryClient, no side effects) so they're trivially unit-testable and reusable
// across every offline stop mutation.

// `listStops` returns stops ordered by date ascending; keep the optimistic list
// in the same order so the UI doesn't jump when the real row arrives.
function byDate(a: TourStop, b: TourStop): number {
  return a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at);
}

// Insert (or replace, matched by id) a stop and re-sort. Replacing by id keeps
// re-runs idempotent: an optimistic insert followed by the real synced row (same
// client id) collapses to one entry instead of duplicating.
export function insertStop(list: TourStop[] | undefined, stop: TourStop): TourStop[] {
  const base = (list ?? []).filter((s) => s.id !== stop.id);
  return [...base, stop].sort(byDate);
}

export function removeStop(list: TourStop[] | undefined, id: string): TourStop[] {
  return (list ?? []).filter((s) => s.id !== id);
}

// Replace the stop with matching id via `fn`, then re-sort (an edit can move the
// date). Non-matching stops and an undefined list are handled safely.
export function mapStop(
  list: TourStop[] | undefined,
  id: string,
  fn: (stop: TourStop) => TourStop,
): TourStop[] {
  return (list ?? []).map((s) => (s.id === id ? fn(s) : s)).sort(byDate);
}

// Optimistic stop for an offline show create. Mirrors the read path's `toStop`:
// a named venue is "booked", a city-only show shows as "Venue TBD". Coordinates
// are whatever the picker captured; if none, the pin resolves at sync time.
export function showVarsToStop(vars: CreateShowInput & { id: string }): TourStop {
  const venueName = vars.venueName?.trim() || null;
  const booked = venueName != null;
  return {
    id: vars.id,
    date: vars.date,
    kind: 'show',
    created_at: new Date().toISOString(),
    created_by: vars.userId,
    label: null,
    venueId: vars.venueId ?? null,
    location: {
      name: booked ? venueName : 'Venue TBD',
      city: vars.venueCity?.trim() || '',
      country: null,
      address: vars.address ?? null,
      latitude: vars.latitude ?? null,
      longitude: vars.longitude ?? null,
      booked,
    },
  };
}

// Applies an edit to an existing cached show stop (id/kind/created_* preserved).
export function applyShowUpdate(existing: TourStop, vars: UpdateShowInput): TourStop {
  const venueName = vars.venueName?.trim() || null;
  const booked = venueName != null;
  return {
    ...existing,
    date: vars.date,
    label: null,
    venueId: vars.venueId ?? null,
    location: {
      name: booked ? venueName : 'Venue TBD',
      city: vars.venueCity?.trim() || '',
      country: existing.location?.country ?? null,
      address: vars.address ?? null,
      latitude: vars.latitude ?? null,
      longitude: vars.longitude ?? null,
      booked,
    },
  };
}

// Applies an edit to an existing cached off-day stop.
export function applyOffDayUpdate(existing: TourStop, vars: UpdateOffDayInput): TourStop {
  const city = vars.city?.trim() || null;
  const label = vars.label?.trim() || null;
  const hasLocation = city != null || label != null || vars.latitude != null;
  return {
    ...existing,
    date: vars.date,
    label,
    location: hasLocation
      ? {
          name: label || city || 'Off day',
          city: city ?? '',
          country: existing.location?.country ?? null,
          address: vars.address ?? null,
          latitude: vars.latitude ?? null,
          longitude: vars.longitude ?? null,
          booked: false,
        }
      : null,
  };
}

// Builds the optimistic TourStop shown immediately for an offline off-day create.
// Mirrors how `toStop` (the read path) would render the same row so the UI is
// consistent before/after sync. Coordinates/country are intentionally left null:
// geocoding is deferred to sync time (see api.ts / the mutationFn), so an offline
// off day simply has no pin until it syncs.
export function offDayVarsToStop(vars: CreateOffDayInput & { id: string }): TourStop {
  const city = vars.city?.trim() || null;
  const label = vars.label?.trim() || null;
  const hasLocation = city != null || label != null || vars.latitude != null;

  return {
    id: vars.id,
    date: vars.date,
    kind: 'off',
    created_at: new Date().toISOString(),
    created_by: vars.userId,
    label,
    venueId: null,
    location: hasLocation
      ? {
          name: label || city || 'Off day',
          city: city ?? '',
          country: null,
          address: vars.address ?? null,
          latitude: vars.latitude ?? null,
          longitude: vars.longitude ?? null,
          booked: false,
        }
      : null,
  };
}
