import { z } from 'zod';
import { createTour } from '@/features/tours/api';
import { createShow } from '@/features/shows/api';
import { getErrorMessage } from '@/lib/errors';
import { geocodeVenue, type VenueMatchConfidence } from '@/lib/mapbox';
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

export type ResolvedImportStop = {
  venueName: string;
  city: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  confidence: VenueMatchConfidence;
  mapboxPlace: string | null;
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
      address: address?.trim() || null,
      latitude: null,
      longitude: null,
      confidence: 'unresolved',
      mapboxPlace: null,
    };
  }

  const geo = await geocodeVenue(name, requestedCity, address).catch(() => null);
  if (!geo) {
    return {
      venueName: name,
      city: requestedCity,
      address: address?.trim() || null,
      latitude: null,
      longitude: null,
      confidence: 'unresolved',
      mapboxPlace: null,
    };
  }

  return {
    venueName: geo.name || name,
    city: requestedCity,
    address: geo.address ?? address?.trim() ?? null,
    latitude: geo.latitude,
    longitude: geo.longitude,
    confidence: geo.confidence,
    mapboxPlace: geo.mapboxPlace,
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
  date: string;
  venueName: string;
  city: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  confidence?: VenueMatchConfidence;
};

export type CreateImportedTourInput = {
  userId: string;
  actName: string;
  // Set when the act was chosen up front, so the import ties to that exact act.
  actId?: string | null;
  tourTitle: string | null;
  stops: ImportStop[];
};

export async function createImportedTour(
  input: CreateImportedTourInput,
): Promise<{ id: string; created: number }> {
  const dates = input.stops.map((stop) => stop.date).sort();
  const { id } = await createTour({
    userId: input.userId,
    actName: input.actName,
    actId: input.actId ?? null,
    title: input.tourTitle ?? undefined,
    startDate: dates[0] ?? null,
    endDate: dates[dates.length - 1] ?? null,
  });

  let created = 0;
  for (const stop of input.stops) {
    const requestedCity = stop.city.trim();
    let venueName = stop.venueName.trim();
    let latitude = stop.latitude ?? null;
    let longitude = stop.longitude ?? null;
    let address = stop.address?.trim() || null;

    const hasConfirmedCoords =
      stop.confidence === 'confirmed' && latitude != null && longitude != null;

    if (!hasConfirmedCoords) {
      const resolved = await resolveImportStop(venueName, requestedCity, address);
      venueName = resolved.venueName;
      address = resolved.address;
      if (resolved.confidence === 'confirmed') {
        latitude = resolved.latitude;
        longitude = resolved.longitude;
      } else {
        latitude = null;
        longitude = null;
      }
    }

    await createShow({
      userId: input.userId,
      tourId: id,
      date: stop.date,
      venueName,
      venueCity: requestedCity,
      latitude,
      longitude,
      address,
    });
    created += 1;
  }

  return { id, created };
}
