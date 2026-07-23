import type { Coord } from '@/features/maps/mapScene';
import type { TourStop } from '@/features/shows/api';
import type { MyTour } from '@/features/tours/api';

// "Tour Mode" is entered automatically — never toggled — whenever today falls
// within a tour the user is on. Detection is driven purely by the calendar and
// the tour's dates, so these helpers are pure and unit-testable.

/**
 * Whether `todayISO` (YYYY-MM-DD) falls within the tour's dates, inclusive.
 * Requires both a start and end date: an undated or half-dated tour can't
 * reliably say "you're on it right now", so it never triggers Tour Mode.
 */
export function isTourActiveOn(
  tour: Pick<MyTour, 'start_date' | 'end_date'>,
  todayISO: string,
): boolean {
  const { start_date, end_date } = tour;
  if (!start_date || !end_date) return false;
  // ISO date strings sort lexicographically, so string comparison is date order.
  return start_date <= todayISO && todayISO <= end_date;
}

/**
 * The tour Tour Mode should focus on today, or null if none is active. When
 * multiple tours overlap today, prefer the one ending soonest (the most
 * "current" commitment), breaking ties by the later start date.
 */
export function pickActiveTour(tours: MyTour[], todayISO: string): MyTour | null {
  const active = tours.filter((tour) => isTourActiveOn(tour, todayISO));
  if (active.length === 0) return null;
  return active.sort((a, b) => {
    if (a.end_date !== b.end_date) return (a.end_date ?? '') < (b.end_date ?? '') ? -1 : 1;
    return (a.start_date ?? '') > (b.start_date ?? '') ? -1 : 1;
  })[0];
}

function hasCoords(stop: TourStop): boolean {
  return stop.location?.latitude != null && stop.location?.longitude != null;
}

export type CurrentStop = {
  stop: TourStop;
  coordinate: Coord;
};

/**
 * The stop whose venue Tour Mode should point at: today's show, then any stop
 * dated today, then the next upcoming located stop, and finally the most recent
 * located stop as a fallback. Only stops with coordinates are considered, since
 * we need a point to frame on the map. Returns null when nothing is located.
 */
export function pickCurrentStop(stops: TourStop[], todayISO: string): CurrentStop | null {
  const located = stops
    .filter(hasCoords)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (located.length === 0) return null;

  const toResult = (stop: TourStop): CurrentStop => ({
    stop,
    coordinate: [stop.location!.longitude as number, stop.location!.latitude as number],
  });

  const todayShow = located.find((s) => s.date === todayISO && s.kind === 'show');
  if (todayShow) return toResult(todayShow);

  const todayAny = located.find((s) => s.date === todayISO);
  if (todayAny) return toResult(todayAny);

  const upcoming = located.find((s) => s.date >= todayISO);
  if (upcoming) return toResult(upcoming);

  return toResult(located[located.length - 1]);
}
