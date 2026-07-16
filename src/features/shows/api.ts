import { backfillVenueCountries, getOrCreateVenue } from '@/features/venues/api';
import { geocodeVenue, reverseGeocodeCountry } from '@/lib/mapbox';
import { supabase } from '@/lib/supabase';

// A tour's itinerary is a list of "stops" (stored in the `shows` table). A stop's
// location can be, in decreasing specificity:
//   * a booked venue (shows) — references the shared `venues` table
//   * an inline city/place (city-only shows with a venue TBD, or off days) — held
//     on the row itself and geocoded so it still lands on the map
//   * nothing yet (a bare date)
export type StopKind = 'show' | 'off';

export type ShowVenue = {
  id: string;
  name: string;
  city: string;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
};

// A point on the map/timeline, normalized across venues, city-only shows, and off
// days. `name` is a venue name, an off-day note/hotel, or "Venue TBD" for a
// city-only show. `booked` is true only when it comes from a real venue.
export type StopLocation = {
  name: string;
  city: string;
  /** Present when geocoded / backfilled; omitted on older or city-only stops. */
  country?: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  booked: boolean;
};

export type TourStop = {
  id: string;
  date: string;
  kind: StopKind;
  created_at: string;
  created_by: string | null;
  label: string | null; // off-day note / hotel name; null for shows
  venueId: string | null;
  location: StopLocation | null;
};

const stopSelect =
  'id, date, kind, label, city, latitude, longitude, address, created_at, created_by, venue:venues(id, name, city, country, latitude, longitude)';

type StopRow = {
  id: string;
  date: string;
  kind: StopKind;
  label: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  created_at: string;
  created_by: string | null;
  venue: ShowVenue | null;
};

function toStop(row: StopRow): TourStop {
  let location: StopLocation | null = null;
  if (row.venue) {
    location = {
      name: row.venue.name,
      city: row.venue.city,
      country: row.venue.country,
      address: null,
      latitude: row.venue.latitude,
      longitude: row.venue.longitude,
      booked: true,
    };
  } else if (row.city != null || row.latitude != null || row.label != null) {
    const fallback = row.kind === 'off' ? row.city || 'Off day' : 'Venue TBD';
    location = {
      name: row.label || fallback,
      city: row.city ?? '',
      country: null,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      booked: false,
    };
  }

  return {
    id: row.id,
    date: row.date,
    kind: row.kind,
    created_at: row.created_at,
    created_by: row.created_by,
    label: row.label,
    venueId: row.venue?.id ?? null,
    location,
  };
}

export async function listStops(tourId: string): Promise<TourStop[]> {
  const { data, error } = await supabase
    .from('shows')
    .select(stopSelect)
    .eq('tour_id', tourId)
    .order('date', { ascending: true });
  if (error) throw error;
  const stops = ((data ?? []) as unknown as StopRow[]).map(toStop);

  // Euro (and other) tours often store bare city names with null venue.country.
  // Reverse-geocode those so the countries stat is accurate on first load.
  const venueRows = stops
    .filter((s) => s.venueId && s.location)
    .map((s) => ({
      id: s.venueId as string,
      country: s.location!.country ?? null,
      latitude: s.location!.latitude,
      longitude: s.location!.longitude,
    }));
  const filled = await backfillVenueCountries(venueRows);
  if (filled.size > 0) {
    for (const stop of stops) {
      if (!stop.venueId || !stop.location) continue;
      const country = filled.get(stop.venueId);
      if (country) stop.location.country = country;
    }
  }

  // City-only / TBD stops: no venue row to persist, but we can still resolve a
  // country from coordinates for this response so tour stats count them.
  await Promise.all(
    stops.map(async (stop) => {
      if (!stop.location || stop.location.country || stop.location.latitude == null) return;
      if (stop.location.longitude == null) return;
      const country = await reverseGeocodeCountry(
        stop.location.longitude,
        stop.location.latitude,
      );
      if (country) stop.location.country = country;
    }),
  );

  return stops;
}

export type StopDetail = {
  id: string;
  tour_id: string;
  date: string;
  kind: StopKind;
  created_by: string | null;
  venue: (ShowVenue & { address: string | null }) | null;
  label: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
};

export async function getStop(stopId: string): Promise<StopDetail> {
  const { data, error } = await supabase
    .from('shows')
    .select(
      'id, tour_id, date, kind, label, city, latitude, longitude, address, created_by, venue:venues(id, name, city, latitude, longitude, address)',
    )
    .eq('id', stopId)
    .single();
  if (error) throw error;
  return data as unknown as StopDetail;
}

// --- Shows ------------------------------------------------------------------

export type VenueFields = {
  // Empty when the venue isn't booked yet; the city still places it on the map.
  venueName?: string | null;
  venueCity: string;
  // When the user picked an existing catalog venue, its id is carried through so
  // we reuse that exact row instead of re-deduping by name+city (avoids dupes).
  venueId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  /** Country from the geocoder, persisted on the venue for the countries stat. */
  venueCountry?: string | null;
};

export type CreateShowInput = VenueFields & {
  userId: string;
  tourId: string;
  date: string;
};

// A booked venue lives in the shared `venues` table (deduped, coordinates reused
// across tours). A city-only show ("venue TBD") stores just its geocoded city
// inline so it still appears on the map. Returns the columns to write for each.
async function resolveShowLocation(input: VenueFields & { userId: string }) {
  const name = input.venueName?.trim();
  if (name) {
    // The user picked an existing catalog venue — reuse that exact row.
    if (input.venueId) {
      return { venue_id: input.venueId, city: null, latitude: null, longitude: null, address: null };
    }
    const venueId = await getOrCreateVenue({
      name,
      city: input.venueCity,
      userId: input.userId,
      latitude: input.latitude,
      longitude: input.longitude,
      address: input.address,
      country: input.venueCountry,
    });
    return { venue_id: venueId, city: null, latitude: null, longitude: null, address: null };
  }

  // No venue yet: geocode the known city so there's still a pin. Best-effort.
  const geo = await geocodeVenue(input.venueCity, '').catch(() => null);
  const hasCoords = geo?.confidence === 'confirmed';
  return {
    venue_id: null as string | null,
    city: input.venueCity.trim(),
    latitude: hasCoords ? (geo?.latitude ?? null) : null,
    longitude: hasCoords ? (geo?.longitude ?? null) : null,
    address: null,
  };
}

export async function createShow(input: CreateShowInput): Promise<{ id: string }> {
  const location = await resolveShowLocation(input);

  const { data, error } = await supabase
    .from('shows')
    .insert({
      tour_id: input.tourId,
      created_by: input.userId,
      date: input.date,
      kind: 'show',
      ...location,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data;
}

export type UpdateShowInput = VenueFields & {
  userId: string;
  showId: string;
  date: string;
};

export async function updateShow(input: UpdateShowInput): Promise<void> {
  const location = await resolveShowLocation(input);

  const { error } = await supabase
    .from('shows')
    .update({ date: input.date, ...location })
    .eq('id', input.showId);

  if (error) throw error;
}

// --- Off days ---------------------------------------------------------------

export type OffDayFields = {
  label?: string | null;
  city?: string | null;
  // Captured when a place (hotel/address) is picked from Mapbox search.
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
};

export type CreateOffDayInput = OffDayFields & {
  userId: string;
  tourId: string;
  date: string;
};

// Resolves coordinates for an off day: prefer the ones from a picked place,
// otherwise geocode the typed city. Best-effort — a failure still saves the day
// (it just won't have a pin).
async function resolveOffLocation(input: OffDayFields) {
  const city = input.city?.trim() || null;
  let latitude = input.latitude ?? null;
  let longitude = input.longitude ?? null;

  if ((latitude == null || longitude == null) && city) {
    const geo = await geocodeVenue(city, '').catch(() => null);
    if (geo?.confidence === 'confirmed') {
      latitude = geo.latitude;
      longitude = geo.longitude;
    }
  }

  return {
    label: input.label?.trim() || null,
    city,
    address: input.address?.trim() || null,
    latitude,
    longitude,
  };
}

export async function createOffDay(input: CreateOffDayInput): Promise<{ id: string }> {
  const location = await resolveOffLocation(input);

  const { data, error } = await supabase
    .from('shows')
    .insert({
      tour_id: input.tourId,
      created_by: input.userId,
      venue_id: null,
      date: input.date,
      kind: 'off',
      ...location,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data;
}

export type UpdateOffDayInput = OffDayFields & {
  userId: string;
  stopId: string;
  date: string;
};

export async function updateOffDay(input: UpdateOffDayInput): Promise<void> {
  const location = await resolveOffLocation(input);

  const { error } = await supabase
    .from('shows')
    .update({ date: input.date, ...location })
    .eq('id', input.stopId);

  if (error) throw error;
}

export async function deleteStop(stopId: string): Promise<void> {
  const { error } = await supabase.from('shows').delete().eq('id', stopId);
  if (error) throw error;
}
