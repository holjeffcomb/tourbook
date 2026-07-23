import { z } from 'zod';
import { resolveShowLocation } from '@/features/shows/api';
import { findCatalogVenue } from '@/features/venues/api';
import { getErrorMessage } from '@/lib/errors';
import { geocodeAddress, geocodeVenue, type VenueMatchConfidence } from '@/lib/mapbox';
import { supabase } from '@/lib/supabase';

const parsedStopSchema = z.object({
  date: z.string().nullable(),
  venueName: z.string(),
  city: z.string(),
});

const parsedTourSchema = z.object({
  actName: z.string(),
  tourTitle: z.string().nullable(),
  stops: z.array(parsedStopSchema),
});

export type ParsedStop = z.infer<typeof parsedStopSchema>;
export type ParsedTour = z.infer<typeof parsedTourSchema>;

export type { VenueMatchConfidence };

/**
 * Where a resolved match came from: your saved venues, a Mapbox venue-name
 * lookup, a manual address lookup, or nothing.
 */
export type VenueMatchSource = 'catalog' | 'mapbox' | 'address' | 'none';

export type ResolvedImportStop = {
  venueName: string;
  city: string;
  country: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  confidence: VenueMatchConfidence;
  mapboxPlace: string | null;
  /** Which source produced the match — drives the review badge. */
  source: VenueMatchSource;
  /** Set only for catalog matches, so the show reuses that exact venue row. */
  venueId: string | null;
  /** Business name Mapbox lists at a resolved address (address source only). */
  mapboxName?: string | null;
};

export async function resolveImportStop(
  venueName: string,
  city: string,
  address?: string | null,
): Promise<ResolvedImportStop> {
  const requestedCity = city.trim();
  const name = venueName.trim();

  if (!name || !requestedCity) {
    return {
      venueName: name,
      city: requestedCity,
      country: null,
      address: address?.trim() || null,
      latitude: null,
      longitude: null,
      confidence: 'unresolved',
      mapboxPlace: null,
      source: 'none',
      venueId: null,
    };
  }

  // Trust your own catalog first: a venue you've used before is a confident
  // match on your data, so reuse it (with its coordinates) and skip Mapbox.
  const catalogMatch = await findCatalogVenue(name, requestedCity).catch(() => null);
  if (catalogMatch) {
    return {
      venueName: catalogMatch.name || name,
      city: requestedCity,
      country: catalogMatch.country,
      address: catalogMatch.address ?? address?.trim() ?? null,
      latitude: catalogMatch.latitude,
      longitude: catalogMatch.longitude,
      confidence: 'confirmed',
      mapboxPlace: catalogMatch.city,
      source: 'catalog',
      venueId: catalogMatch.id,
    };
  }

  const geo = await geocodeVenue(name, requestedCity, address).catch(() => null);
  if (!geo) {
    return {
      venueName: name,
      city: requestedCity,
      country: null,
      address: address?.trim() || null,
      latitude: null,
      longitude: null,
      confidence: 'unresolved',
      mapboxPlace: null,
      source: 'none',
      venueId: null,
    };
  }

  return {
    venueName: geo.name || name,
    city: requestedCity,
    country: geo.country,
    address: geo.address ?? address?.trim() ?? null,
    latitude: geo.latitude,
    longitude: geo.longitude,
    confidence: geo.confidence,
    mapboxPlace: geo.mapboxPlace,
    source: 'mapbox',
    venueId: null,
  };
}

/**
 * Manual fallback for a stop whose venue name won't geocode: resolve a street
 * address straight to coordinates and surface the business name Mapbox lists
 * there (so foreign-language names can be reconciled). Never touches the venue
 * name — the caller decides whether to adopt the returned `mapboxName`.
 */
export async function resolveImportStopByAddress(
  address: string,
  city: string,
): Promise<ResolvedImportStop> {
  const requestedCity = city.trim();
  const street = address.trim();

  const unresolved: ResolvedImportStop = {
    venueName: '',
    city: requestedCity,
    country: null,
    address: street || null,
    latitude: null,
    longitude: null,
    confidence: 'unresolved',
    mapboxPlace: null,
    source: 'none',
    venueId: null,
    mapboxName: null,
  };

  if (!street || !requestedCity) return unresolved;

  const geo = await geocodeAddress(street, requestedCity).catch(() => null);
  if (!geo) return unresolved;

  return {
    venueName: '',
    city: requestedCity,
    country: geo.country,
    address: geo.address ?? street,
    latitude: geo.latitude,
    longitude: geo.longitude,
    confidence: 'confirmed',
    mapboxPlace: geo.mapboxPlace,
    source: 'address',
    venueId: null,
    mapboxName: geo.name,
  };
}

// On failure supabase-js throws with the raw Response on `error.context` and an
// opaque "non-2xx status code" message. Read the body ourselves to surface the
// real reason — our function returns `{ error }`, but the gateway can return
// `{ msg }` (e.g. "Invalid JWT") or a non-JSON string, so handle all shapes.
async function functionErrorMessage(error: unknown): Promise<string> {
  const ctx =
    error && typeof error === 'object' ? (error as { context?: unknown }).context : undefined;
  const res = ctx as Response | undefined;
  if (res && typeof res.text === 'function') {
    const status = typeof res.status === 'number' ? res.status : undefined;
    try {
      const raw = (await res.text()).trim();
      if (raw) {
        try {
          const body = JSON.parse(raw) as Record<string, unknown>;
          const msg = body.error ?? body.message ?? body.msg ?? body.error_description;
          if (typeof msg === 'string' && msg) {
            return status ? `${msg} (HTTP ${status})` : msg;
          }
        } catch {
          // non-JSON body; fall back to the raw text below
        }
        return status ? `${raw.slice(0, 300)} (HTTP ${status})` : raw.slice(0, 300);
      }
      if (status) return `Edge Function error (HTTP ${status})`;
    } catch {
      // body unreadable; fall through to the generic message
    }
  }
  return getErrorMessage(error, 'Tour parsing failed. Please try again.');
}

export async function parseTourText(text: string): Promise<ParsedTour> {
  const { data, error } = await supabase.functions.invoke('parse-tour', { body: { text } });
  if (error) throw new Error(await functionErrorMessage(error));

  const result = parsedTourSchema.safeParse(data);
  if (!result.success) throw new Error('The parser returned data in an unexpected shape.');
  return result.data;
}

export type ImportStop = {
  // Stable client-generated show id, minted once during review (see
  // CreateImportedTourInput.id). Passed straight through to the RPC so a retry or
  // re-tap of the same import upserts the same row (`on conflict (id) do nothing`)
  // instead of duplicating it.
  id: string;
  date: string;
  venueName: string;
  city: string;
  country?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  confidence?: VenueMatchConfidence;
  // Set when the stop matched a saved catalog venue, so the show reuses that
  // exact row instead of re-deduping by name+city.
  venueId?: string | null;
};

export type CreateImportedTourInput = {
  // Stable client-generated tour id, minted ONCE during review (not per submit)
  // and carried in the mutation variables — mirroring the create-tour pattern
  // (`CreateTourVars = CreateTourInput & { id: string }`). This is what makes a
  // retry/re-tap converge to a single tour: the RPC is idempotent on this id, and
  // the client always sends the same one for the same import.
  id: string;
  userId: string;
  actName: string;
  // Set when the act was chosen up front, so the import ties to that exact act.
  actId?: string | null;
  tourTitle: string | null;
  stops: ImportStop[];
};

// Shape of one stop in the `create_imported_tour` jsonb payload: a fully
// pre-resolved show row (venue_id for booked venues, else inline city/coords),
// carrying a client-generated id so the RPC's insert is idempotent on replay.
type ImportStopPayload = {
  id: string;
  date: string;
  kind: 'show';
  venue_id: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
};

// Stage 2.5 — "online to prepare, atomic to commit" (docs/design/offline-write-support.md §4.8).
//
// Preparation (online, client-side): for each reviewed stop, resolve its venue/geocoding with the
// same `resolveShowLocation` the single-show write uses — reusing a catalog venue by id, creating/
// deduping a booked venue, or geocoding a city-only stop. Any stop not confidently resolved during
// review is re-resolved here as a safety net, mirroring the previous behavior.
//
// Commit (one transaction): hand the fully-resolved rows to `create_imported_tour`, which writes the
// tour + membership + every show atomically and idempotently. IDs are NOT minted here — the tour id
// (`input.id`) and each show id (`stop.id`) are stable variables minted once during review, so a
// retry/re-tap re-sends the SAME ids and the idempotent RPC converges to a single tour with no
// duplicate shows. Import stays online-only by design — parsing and geocoding can't run offline —
// so this is a normal (non-persisted) mutation.
export async function createImportedTour(
  input: CreateImportedTourInput,
): Promise<{ id: string; created: number }> {
  const dates = input.stops.map((stop) => stop.date).sort();

  const stops: ImportStopPayload[] = [];
  for (const stop of input.stops) {
    const requestedCity = stop.city.trim();
    let venueName = stop.venueName.trim();
    let latitude = stop.latitude ?? null;
    let longitude = stop.longitude ?? null;
    let address = stop.address?.trim() || null;
    let country = stop.country ?? null;
    let venueId = stop.venueId ?? null;

    const hasConfirmedCoords =
      stop.confidence === 'confirmed' && latitude != null && longitude != null;

    if (!hasConfirmedCoords) {
      const resolved = await resolveImportStop(venueName, requestedCity, address);
      venueName = resolved.venueName;
      address = resolved.address;
      country = resolved.country ?? country;
      venueId = resolved.venueId;
      if (resolved.confidence === 'confirmed') {
        latitude = resolved.latitude;
        longitude = resolved.longitude;
      } else {
        latitude = null;
        longitude = null;
      }
    }

    // Resolve to concrete show columns (venue_id vs inline location) client-side, so the RPC is a
    // pure insert. This creates/dedupes the venue now, while online.
    const location = await resolveShowLocation({
      userId: input.userId,
      venueName,
      venueId,
      venueCity: requestedCity,
      venueCountry: country,
      latitude,
      longitude,
      address,
    });

    stops.push({
      id: stop.id,
      date: stop.date,
      kind: 'show',
      venue_id: location.venue_id,
      city: location.city,
      country: location.country,
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address,
    });
  }

  const { data, error } = await supabase.rpc('create_imported_tour', {
    p_tour_id: input.id,
    p_act_id: input.actId ?? null,
    p_act_name: input.actName,
    p_title: input.tourTitle ?? null,
    p_start_date: dates[0] ?? null,
    p_end_date: dates[dates.length - 1] ?? null,
    // Import doesn't set visibility; the RPC coalesces null → the default 'private'.
    p_visibility: null,
    p_role: null,
    p_stops: stops,
  });
  if (error) throw error;

  return { id: (data as string | null) ?? input.id, created: stops.length };
}
