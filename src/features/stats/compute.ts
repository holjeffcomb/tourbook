import type { TourStop } from '@/features/shows/api';
import type { TourMember } from '@/features/tours/api';
import { formatShowDate, isoToDate } from '@/lib/date';
import {
  EARTH_CIRCUMFERENCE_MILES,
  haversineMiles,
  inferCountryFromCity,
  normalizePlaceKey,
  WORLD_COUNTRY_COUNT,
} from '@/lib/geo';
import type { DriveSegment, NearMiss, OverlapStats, PassportStats, TourStats } from '@/features/stats/types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_PLURAL = [
  'Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays',
];

/** Day index (days since epoch, UTC) for an ISO date — for consecutive-day math. */
function isoDayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/** Longest run of consecutive calendar days present in the given ISO dates. */
function longestConsecutiveRun(dates: Iterable<string>): number {
  const days = [...new Set([...dates])].map(isoDayNumber).sort((a, b) => a - b);
  if (days.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i += 1) {
    if (days[i] === days[i - 1] + 1) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}

function topEntry<K>(map: Map<K, number>): { key: K; count: number } | null {
  let best: { key: K; count: number } | null = null;
  for (const [key, count] of map) {
    if (!best || count > best.count) best = { key, count };
  }
  return best;
}

function stopLabel(stop: TourStop): string {
  if (stop.location?.name) return stop.location.name;
  if (stop.location?.city) return stop.location.city;
  return stop.kind === 'off' ? 'Off day' : 'Show';
}

function locatedStops(stops: TourStop[]): TourStop[] {
  return stops.filter(
    (s) => s.location?.latitude != null && s.location?.longitude != null,
  );
}

/** Drive segments between consecutive located stops in date order. */
export function computeDriveSegments(stops: TourStop[]): DriveSegment[] {
  const located = locatedStops(stops);
  const segments: DriveSegment[] = [];

  for (let i = 0; i < located.length - 1; i += 1) {
    const from = located[i];
    const to = located[i + 1];
    const lat1 = from.location!.latitude as number;
    const lon1 = from.location!.longitude as number;
    const lat2 = to.location!.latitude as number;
    const lon2 = to.location!.longitude as number;
    segments.push({
      fromStopId: from.id,
      toStopId: to.id,
      miles: haversineMiles(lat1, lon1, lat2, lon2),
      fromLabel: stopLabel(from),
      toLabel: stopLabel(to),
    });
  }

  return segments;
}

function calendarSpanDays(stops: TourStop[]): number {
  const dates = stops.map((s) => s.date).filter(Boolean).sort();
  if (dates.length === 0) return 0;
  const first = Date.parse(dates[0]);
  const last = Date.parse(dates[dates.length - 1]);
  if (Number.isNaN(first) || Number.isNaN(last)) return dates.length;
  return Math.round((last - first) / 86_400_000) + 1;
}

function showOffLabel(showCount: number, offDayCount: number): string {
  if (offDayCount === 0) return `${showCount} show${showCount === 1 ? '' : 's'}, no off days`;
  const ratio = (showCount / offDayCount).toFixed(1);
  return `${showCount}:${offDayCount} (${ratio} shows per off day)`;
}

function uniqueCountriesFromStops(stops: TourStop[]): string[] {
  const countries = new Set<string>();
  for (const stop of stops) {
    const city = stop.location?.city;
    if (!city) continue;
    const country = inferCountryFromCity(city);
    if (country) countries.add(country);
  }
  return [...countries].sort();
}

function pickExtremeSegment(
  segments: DriveSegment[],
  pick: 'max' | 'min',
): DriveSegment | null {
  const positive = segments.filter((s) => s.miles > 0.1);
  if (positive.length === 0) return null;
  return positive.reduce((best, seg) =>
    pick === 'max' ? (seg.miles > best.miles ? seg : best) : seg.miles < best.miles ? seg : best,
  );
}

export function computeTourStats(stops: TourStop[]): TourStats {
  const showCount = stops.filter((s) => s.kind === 'show').length;
  const offDayCount = stops.filter((s) => s.kind === 'off').length;
  const located = locatedStops(stops);
  const segments = computeDriveSegments(stops);
  const totalMiles = segments.reduce((sum, s) => sum + s.miles, 0);

  const cities = new Set<string>();
  const venues = new Set<string>();
  for (const stop of stops) {
    const city = stop.location?.city?.trim();
    if (city) cities.add(normalizePlaceKey(city));
    if (stop.kind === 'show' && stop.location?.booked && stop.location.name) {
      venues.add(normalizePlaceKey(`${stop.location.name}|${city ?? ''}`));
    }
  }

  return {
    showCount,
    offDayCount,
    totalStops: stops.length,
    showOffLabel: showOffLabel(showCount, offDayCount),
    calendarDays: calendarSpanDays(stops),
    uniqueCities: cities.size,
    uniqueVenues: venues.size,
    locatedStops: located.length,
    unlocatedStops: stops.length - located.length,
    totalMiles,
    segmentCount: segments.length,
    avgDriveMiles: segments.length > 0 ? totalMiles / segments.length : 0,
    longestDrive: pickExtremeSegment(segments, 'max'),
    shortestDrive: pickExtremeSegment(segments, 'min'),
    countries: uniqueCountriesFromStops(stops),
  };
}

export type VisitedPlace = {
  id: string;
  latitude: number;
  longitude: number;
  /** How many times the user has been here — drives heatmap/point intensity. */
  weight: number;
  label: string;
  city: string;
  /** Distinct tours that stopped here (ids match the stopsByTourId keys). */
  tourIds: string[];
  /** Most recent visit date (ISO YYYY-MM-DD), or null if none had a date. */
  lastVisit: string | null;
  /** Whether any visit here was to a booked venue (vs. a city-only stop). */
  booked: boolean;
};

/**
 * Collapses every located stop across tours into unique places for the Lifetime
 * map. Stops within ~11m of each other merge into one point, `weight` counts the
 * visits, and each place tracks the tours and latest date so a tapped marker can
 * show useful detail. Sorted most-visited first.
 */
export function computeVisitedPlaces(stopsByTourId: Record<string, TourStop[]>): VisitedPlace[] {
  type Accum = Omit<VisitedPlace, 'tourIds'> & { tourIds: Set<string> };
  const places = new Map<string, Accum>();

  for (const [tourId, stops] of Object.entries(stopsByTourId)) {
    for (const stop of stops) {
      const lat = stop.location?.latitude;
      const lng = stop.location?.longitude;
      if (lat == null || lng == null) continue;

      const date = ISO_DATE.test(stop.date) ? stop.date : null;
      const booked = stop.location?.booked ?? false;
      // ~11m grid so the same venue/place across tours merges into one point.
      const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
      const existing = places.get(key);
      if (existing) {
        existing.weight += 1;
        existing.tourIds.add(tourId);
        // Prefer a real venue label over a fallback like "Venue TBD".
        if ((!existing.label || (!existing.booked && booked)) && stop.location?.name) {
          existing.label = stop.location.name;
        }
        if (!existing.city && stop.location?.city) existing.city = stop.location.city;
        if (booked) existing.booked = true;
        if (date && (!existing.lastVisit || date > existing.lastVisit)) existing.lastVisit = date;
        continue;
      }

      places.set(key, {
        id: key,
        latitude: lat,
        longitude: lng,
        weight: 1,
        label: stop.location?.name ?? '',
        city: stop.location?.city ?? '',
        tourIds: new Set([tourId]),
        lastVisit: date,
        booked,
      });
    }
  }

  return [...places.values()]
    .map((p) => ({ ...p, tourIds: [...p.tourIds] }))
    .sort((a, b) => b.weight - a.weight);
}

export type TourRoute = {
  tourId: string;
  /** Located stops in date order as [lng, lat] pairs. */
  coordinates: [number, number][];
};

/**
 * One ordered route per tour for the Lifetime routes overlay: located stops
 * sorted by date. Tours with fewer than two located stops are omitted (no line
 * to draw).
 */
export function computeTourRoutes(stopsByTourId: Record<string, TourStop[]>): TourRoute[] {
  const routes: TourRoute[] = [];
  for (const [tourId, stops] of Object.entries(stopsByTourId)) {
    const coordinates = [...stops]
      .filter((s) => s.location?.latitude != null && s.location?.longitude != null)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((s) => [s.location!.longitude as number, s.location!.latitude as number] as [
        number,
        number,
      ]);
    if (coordinates.length >= 2) routes.push({ tourId, coordinates });
  }
  return routes;
}

export type PassportInput = {
  userId: string;
  tours: { id: string; actName: string }[];
  stopsByTourId: Record<string, TourStop[]>;
  membersByTourId: Record<string, TourMember[]>;
};

export function computePassportStats(input: PassportInput): PassportStats {
  const { userId, tours, stopsByTourId, membersByTourId } = input;

  let totalShows = 0;
  let totalMiles = 0;
  let longestTourMiles = 0;
  let longestSingleDrive: DriveSegment | null = null;
  let firstShowDate: string | null = null;
  let lastShowDate: string | null = null;

  const cityCounts = new Map<string, { city: string; count: number }>();
  const venueCounts = new Map<string, { name: string; city: string; count: number }>();
  const countries = new Set<string>();
  const years = new Set<number>();
  const coMemberTours = new Map<string, { userId: string; name: string; tourCount: number }>();
  const actNames = new Set<string>();
  const actShows = new Map<string, number>();
  const showsByYear = new Map<number, number>();
  const showsByMonth = new Map<number, number>();
  const showsByWeekday = new Map<number, number>();
  const showDates = new Set<string>();
  const allDates = new Set<string>();

  for (const tour of tours) {
    const stops = stopsByTourId[tour.id] ?? [];
    const tourStats = computeTourStats(stops);

    totalShows += tourStats.showCount;
    totalMiles += tourStats.totalMiles;
    longestTourMiles = Math.max(longestTourMiles, tourStats.totalMiles);

    const actName = tour.actName?.trim();
    if (actName) {
      actNames.add(actName);
      if (tourStats.showCount > 0) {
        actShows.set(actName, (actShows.get(actName) ?? 0) + tourStats.showCount);
      }
    }

    if (
      tourStats.longestDrive &&
      (!longestSingleDrive || tourStats.longestDrive.miles > longestSingleDrive.miles)
    ) {
      longestSingleDrive = tourStats.longestDrive;
    }

    for (const country of tourStats.countries) countries.add(country);

    for (const stop of stops) {
      const city = stop.location?.city?.trim();
      if (city) {
        const key = normalizePlaceKey(city);
        const existing = cityCounts.get(key);
        if (existing) existing.count += 1;
        else cityCounts.set(key, { city, count: 1 });
      }

      if (stop.kind === 'show' && stop.location?.booked && stop.location.name) {
        const vKey = normalizePlaceKey(`${stop.location.name}|${city ?? ''}`);
        const existing = venueCounts.get(vKey);
        if (existing) existing.count += 1;
        else venueCounts.set(vKey, { name: stop.location.name, city: city ?? '', count: 1 });
      }

      if (stop.date && ISO_DATE.test(stop.date)) {
        years.add(Number(stop.date.slice(0, 4)));
        allDates.add(stop.date);

        if (stop.kind === 'show') {
          showDates.add(stop.date);
          if (!firstShowDate || stop.date < firstShowDate) firstShowDate = stop.date;
          if (!lastShowDate || stop.date > lastShowDate) lastShowDate = stop.date;
          const year = Number(stop.date.slice(0, 4));
          const month = Number(stop.date.slice(5, 7));
          const weekday = isoToDate(stop.date).getDay();
          showsByYear.set(year, (showsByYear.get(year) ?? 0) + 1);
          showsByMonth.set(month, (showsByMonth.get(month) ?? 0) + 1);
          showsByWeekday.set(weekday, (showsByWeekday.get(weekday) ?? 0) + 1);
        }
      }
    }

    for (const member of membersByTourId[tour.id] ?? []) {
      if (member.user_id === userId) continue;
      const name = member.profile?.display_name?.trim() || 'Member';
      const existing = coMemberTours.get(member.user_id);
      if (existing) existing.tourCount += 1;
      else coMemberTours.set(member.user_id, { userId: member.user_id, name, tourCount: 1 });
    }
  }

  const mostVisitedCity = [...cityCounts.values()].sort((a, b) => b.count - a.count)[0] ?? null;
  const mostVisitedVenue = [...venueCounts.values()].sort((a, b) => b.count - a.count)[0] ?? null;
  const mostTouredWith =
    [...coMemberTours.values()].sort((a, b) => b.tourCount - a.tourCount)[0] ?? null;

  const topActEntry = topEntry(actShows);
  const topAct = topActEntry ? { name: topActEntry.key, shows: topActEntry.count } : null;
  const busiestYearEntry = topEntry(showsByYear);
  const busiestYear = busiestYearEntry
    ? { year: busiestYearEntry.key, shows: busiestYearEntry.count }
    : null;
  const busiestMonthEntry = topEntry(showsByMonth);
  const busiestMonth = busiestMonthEntry
    ? { month: busiestMonthEntry.key, shows: busiestMonthEntry.count }
    : null;
  const weekdayEntry = topEntry(showsByWeekday);
  const favoriteWeekday = weekdayEntry
    ? { weekday: weekdayEntry.key, shows: weekdayEntry.count }
    : null;
  const longestShowStreak = longestConsecutiveRun(showDates);

  const uniqueCountries = countries.size;
  const countryPercent = uniqueCountries > 0 ? (uniqueCountries / WORLD_COUNTRY_COUNT) * 100 : 0;
  const earthLaps = totalMiles / EARTH_CIRCUMFERENCE_MILES;

  const uniqueActs = actNames.size;
  const multiYear = years.size > 1;

  const highlights: PassportStats['highlights'] = [];
  if (firstShowDate) {
    highlights.push({
      group: 'time',
      label: 'On the road since',
      value: firstShowDate.slice(0, 4),
      detail: `First show · ${formatShowDate(firstShowDate)}`,
    });
  }
  if (busiestYear && multiYear) {
    highlights.push({
      group: 'time',
      label: 'Busiest year',
      value: String(busiestYear.year),
      detail: `${busiestYear.shows} show${busiestYear.shows === 1 ? '' : 's'}`,
    });
  }
  if (busiestMonth && totalShows >= 3) {
    highlights.push({
      group: 'time',
      label: 'Favorite month',
      value: MONTH_NAMES[busiestMonth.month - 1] ?? String(busiestMonth.month),
      detail: `${busiestMonth.shows} show${busiestMonth.shows === 1 ? '' : 's'} all-time`,
    });
  }
  if (favoriteWeekday && totalShows >= 3) {
    highlights.push({
      group: 'time',
      label: 'Plays the most on',
      value: WEEKDAY_PLURAL[favoriteWeekday.weekday] ?? '—',
      detail: `${favoriteWeekday.shows} show${favoriteWeekday.shows === 1 ? '' : 's'}`,
    });
  }
  if (longestShowStreak >= 3) {
    highlights.push({
      group: 'time',
      label: 'Longest run',
      value: `${longestShowStreak} nights`,
      detail: 'back-to-back shows',
    });
  }
  if (mostVisitedCity && mostVisitedCity.count > 1) {
    highlights.push({
      group: 'places',
      label: 'Home away from home',
      value: mostVisitedCity.city,
      detail: `${mostVisitedCity.count} stops`,
    });
  }
  if (mostVisitedVenue && mostVisitedVenue.count > 1) {
    highlights.push({
      group: 'places',
      label: 'Most played venue',
      value: mostVisitedVenue.name,
      detail: mostVisitedVenue.city
        ? `${mostVisitedVenue.city} · ${mostVisitedVenue.count}×`
        : `${mostVisitedVenue.count}×`,
    });
  }
  if (topAct && uniqueActs > 1) {
    highlights.push({
      group: 'people',
      label: 'Most shows for',
      value: topAct.name,
      detail: `${topAct.shows} show${topAct.shows === 1 ? '' : 's'}`,
    });
  }
  if (mostTouredWith) {
    highlights.push({
      group: 'people',
      label: 'Most toured with',
      value: mostTouredWith.name,
      detail: `${mostTouredWith.tourCount} tour${mostTouredWith.tourCount === 1 ? '' : 's'}`,
    });
  }
  if (longestSingleDrive) {
    highlights.push({
      group: 'road',
      label: 'Longest leg',
      value: `${Math.round(longestSingleDrive.miles).toLocaleString()} mi`,
      detail: `${longestSingleDrive.fromLabel} → ${longestSingleDrive.toLabel}`,
    });
  }
  if (longestTourMiles > 0) {
    highlights.push({
      group: 'road',
      label: 'Longest tour',
      value: `${Math.round(longestTourMiles).toLocaleString()} mi`,
      detail: 'total distance',
    });
  }

  return {
    tourCount: tours.length,
    totalShows,
    totalMiles,
    earthLaps,
    uniqueCities: cityCounts.size,
    uniqueVenues: venueCounts.size,
    uniqueCountries,
    countryPercent,
    countriesWithData: uniqueCountries,
    uniqueActs,
    daysOnRoad: allDates.size,
    longestShowStreak,
    firstShowDate,
    lastShowDate,
    mostVisitedCity,
    mostVisitedVenue,
    mostTouredWith,
    topAct,
    busiestYear,
    busiestMonth,
    favoriteWeekday,
    longestTourMiles,
    longestSingleDrive,
    highlights,
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type OverlapTour = {
  id: string;
  actName: string;
  title: string | null;
};

export type OverlapInput = {
  toursA: OverlapTour[];
  toursB: OverlapTour[];
  stopsByTourIdA: Record<string, TourStop[]>;
  stopsByTourIdB: Record<string, TourStop[]>;
};

function flattenStops(
  tours: OverlapTour[],
  stopsByTourId: Record<string, TourStop[]>,
): {
  stop: TourStop;
  tour: OverlapTour;
}[] {
  const out: { stop: TourStop; tour: OverlapTour }[] = [];
  for (const tour of tours) {
    for (const stop of stopsByTourId[tour.id] ?? []) {
      out.push({ stop, tour });
    }
  }
  return out;
}

function venueKey(stop: TourStop): string | null {
  if (stop.kind === 'show' && stop.location?.booked && stop.location.name) {
    return normalizePlaceKey(`${stop.location.name}|${stop.location.city ?? ''}`);
  }
  return null;
}

function cityKey(stop: TourStop): string | null {
  const city = stop.location?.city?.trim();
  return city ? normalizePlaceKey(city) : null;
}

function sideStats(tours: OverlapTour[], stopsByTourId: Record<string, TourStop[]>) {
  const allStops = flattenStops(tours, stopsByTourId).map((x) => x.stop);
  const stats = computeTourStats(allStops);
  // Recompute miles across tours (not one continuous route).
  let miles = 0;
  for (const tour of tours) {
    miles += computeTourStats(stopsByTourId[tour.id] ?? []).totalMiles;
  }
  return {
    shows: stats.showCount,
    miles,
    cities: stats.uniqueCities,
    countries: stats.countries.length,
  };
}

export function computeOverlap(input: OverlapInput): OverlapStats {
  const { toursA, toursB, stopsByTourIdA, stopsByTourIdB } = input;

  const idsA = new Set(toursA.map((t) => t.id));
  const sharedTours = toursB.filter((t) => idsA.has(t.id));

  const actsA = new Set(toursA.map((t) => normalizePlaceKey(t.actName)));
  const mutualActs = [
    ...new Set(
      toursB
        .filter((t) => actsA.has(normalizePlaceKey(t.actName)))
        .map((t) => t.actName),
    ),
  ].sort();

  const flatA = flattenStops(toursA, stopsByTourIdA);
  const flatB = flattenStops(toursB, stopsByTourIdB);

  const venuesA = new Set(flatA.map((x) => venueKey(x.stop)).filter(Boolean) as string[]);
  const citiesA = new Set(flatA.map((x) => cityKey(x.stop)).filter(Boolean) as string[]);
  const countriesA = new Set(
    flatA
      .map((x) => (x.stop.location?.city ? inferCountryFromCity(x.stop.location.city) : null))
      .filter(Boolean) as string[],
  );

  const mutualVenues = new Set<string>();
  const mutualCities = new Set<string>();
  const mutualCountries = new Set<string>();
  const venueLabels = new Map<string, string>();
  const cityLabels = new Map<string, string>();

  for (const { stop } of flatB) {
    const v = venueKey(stop);
    if (v && venuesA.has(v)) {
      mutualVenues.add(v);
      venueLabels.set(v, stop.location?.name ?? v);
    }
    const c = cityKey(stop);
    if (c && citiesA.has(c)) {
      mutualCities.add(c);
      cityLabels.set(c, stop.location?.city ?? c);
    }
    const country = stop.location?.city ? inferCountryFromCity(stop.location.city) : null;
    if (country && countriesA.has(country)) mutualCountries.add(country);
  }

  const byDateA = new Map<string, typeof flatA>();
  for (const item of flatA) {
    if (!ISO_DATE.test(item.stop.date)) continue;
    const list = byDateA.get(item.stop.date) ?? [];
    list.push(item);
    byDateA.set(item.stop.date, list);
  }

  const sameDates: OverlapStats['sameDates'] = [];
  for (const item of flatB) {
    if (!ISO_DATE.test(item.stop.date)) continue;
    const matches = byDateA.get(item.stop.date);
    if (!matches?.length) continue;
    for (const a of matches) {
      sameDates.push({
        date: item.stop.date,
        stopA: stopLabel(a.stop),
        stopB: stopLabel(item.stop),
      });
    }
  }
  sameDates.sort((a, b) => (a.date < b.date ? 1 : -1));

  return {
    sharedTourCount: sharedTours.length,
    sharedTours: sharedTours.map((t) => ({
      id: t.id,
      actName: t.actName,
      title: t.title,
    })),
    mutualActs,
    mutualVenues: [...mutualVenues].map((k) => venueLabels.get(k) ?? k).sort(),
    mutualCities: [...mutualCities].map((k) => cityLabels.get(k) ?? k).sort(),
    mutualCountries: [...mutualCountries].sort(),
    sameDateCount: sameDates.length,
    sameDates: sameDates.slice(0, 50),
    you: sideStats(toursA, stopsByTourIdA),
    them: sideStats(toursB, stopsByTourIdB),
  };
}

export type NearMissOptions = {
  dateWindowDays?: number;
  maxMiles?: number;
  /** Exclude pairs that share the same tour id (co-membership). */
  excludeSameTour?: boolean;
};

function daysBetween(a: string, b: string): number {
  const ms = Math.abs(Date.parse(a) - Date.parse(b));
  return Math.round(ms / 86_400_000);
}

export function computeNearMisses(
  toursA: OverlapTour[],
  toursB: OverlapTour[],
  stopsByTourIdA: Record<string, TourStop[]>,
  stopsByTourIdB: Record<string, TourStop[]>,
  options: NearMissOptions = {},
): NearMiss[] {
  const dateWindowDays = options.dateWindowDays ?? 0;
  const maxMiles = options.maxMiles ?? 100;
  const excludeSameTour = options.excludeSameTour ?? true;

  const flatA = flattenStops(toursA, stopsByTourIdA).filter(
    (x) =>
      x.stop.location?.latitude != null &&
      x.stop.location?.longitude != null &&
      ISO_DATE.test(x.stop.date),
  );
  const flatB = flattenStops(toursB, stopsByTourIdB).filter(
    (x) =>
      x.stop.location?.latitude != null &&
      x.stop.location?.longitude != null &&
      ISO_DATE.test(x.stop.date),
  );

  const results: NearMiss[] = [];
  const seen = new Set<string>();

  for (const a of flatA) {
    for (const b of flatB) {
      if (excludeSameTour && a.tour.id === b.tour.id) continue;
      if (daysBetween(a.stop.date, b.stop.date) > dateWindowDays) continue;

      const lat1 = a.stop.location!.latitude as number;
      const lon1 = a.stop.location!.longitude as number;
      const lat2 = b.stop.location!.latitude as number;
      const lon2 = b.stop.location!.longitude as number;
      const miles = haversineMiles(lat1, lon1, lat2, lon2);
      if (miles > maxMiles) continue;

      const pairKey = [a.stop.id, b.stop.id].sort().join(':');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const vA = venueKey(a.stop);
      const vB = venueKey(b.stop);
      const cA = cityKey(a.stop);
      const cB = cityKey(b.stop);
      let kind: NearMiss['kind'] = 'nearby';
      if (vA && vB && vA === vB) kind = 'same_venue';
      else if (cA && cB && cA === cB) kind = 'same_city';

      results.push({
        dateA: a.stop.date,
        dateB: b.stop.date,
        stopA: {
          stopId: a.stop.id,
          label: stopLabel(a.stop),
          city: a.stop.location?.city ?? '',
          lat: lat1,
          lng: lon1,
          tourId: a.tour.id,
          tourTitle: a.tour.title,
          actName: a.tour.actName,
        },
        stopB: {
          stopId: b.stop.id,
          label: stopLabel(b.stop),
          city: b.stop.location?.city ?? '',
          lat: lat2,
          lng: lon2,
          tourId: b.tour.id,
          tourTitle: b.tour.title,
          actName: b.tour.actName,
        },
        milesApart: miles,
        kind,
      });
    }
  }

  return results.sort((x, y) => {
    if (x.milesApart !== y.milesApart) return x.milesApart - y.milesApart;
    return x.dateA < y.dateA ? 1 : -1;
  });
}

/** The later of the two stop dates — used to decide upcoming vs past. */
export function nearMissReferenceDate(miss: Pick<NearMiss, 'dateA' | 'dateB'>): string {
  return miss.dateA >= miss.dateB ? miss.dateA : miss.dateB;
}

export function isUpcomingNearMiss(
  miss: Pick<NearMiss, 'dateA' | 'dateB'>,
  today: string,
): boolean {
  return nearMissReferenceDate(miss) >= today;
}

export function partitionNearMisses(
  misses: NearMiss[],
  today: string,
): { upcoming: NearMiss[]; past: NearMiss[] } {
  const upcoming: NearMiss[] = [];
  const past: NearMiss[] = [];
  for (const miss of misses) {
    if (isUpcomingNearMiss(miss, today)) upcoming.push(miss);
    else past.push(miss);
  }
  // Upcoming: soonest first. Past: most recent first.
  upcoming.sort((a, b) => nearMissReferenceDate(a).localeCompare(nearMissReferenceDate(b)));
  past.sort((a, b) => nearMissReferenceDate(b).localeCompare(nearMissReferenceDate(a)));
  return { upcoming, past };
}

export function isUpcomingDate(date: string, today: string): boolean {
  return date >= today;
}

