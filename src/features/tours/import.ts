import { z } from 'zod';
import { createTour } from '@/features/tours/api';
import { createShow } from '@/features/shows/api';
import { getErrorMessage } from '@/lib/errors';
import { geocodeVenue } from '@/lib/mapbox';
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

// A stop that has passed validation and is ready to become a show.
export type ImportStop = { date: string; venueName: string; city: string };

export type CreateImportedTourInput = {
  userId: string;
  actName: string;
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
    title: input.tourTitle ?? undefined,
    startDate: dates[0] ?? null,
    endDate: dates[dates.length - 1] ?? null,
  });

  // Sequential so shared-venue dedup is race-free and one bad geocode can't
  // abort the rest; geocoding is best-effort (falls back to name + city).
  let created = 0;
  for (const stop of input.stops) {
    const geo = await geocodeVenue(stop.venueName, stop.city).catch(() => null);
    await createShow({
      userId: input.userId,
      tourId: id,
      date: stop.date,
      venueName: stop.venueName,
      venueCity: geo?.city || stop.city,
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      address: geo?.address ?? null,
    });
    created += 1;
  }

  return { id, created };
}
