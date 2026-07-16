import { env } from '@/lib/env';
import { cityMatches, citySearchTerms, normalizePlace } from '@/lib/cityMatch';

// Mapbox Search Box API — the current recommended flow for POI/venue search.
// It's session-based: `suggest` powers the dropdown, `retrieve` returns the
// coordinates for the chosen place. Both are plain HTTPS calls (no native code),
// so this works in the current dev build once a public token is set.
const BASE = 'https://api.mapbox.com/search/searchbox/v1';

export type PlaceSuggestion = {
  mapboxId: string;
  name: string;
  /** Human-readable context, e.g. "Morrison, Colorado, United States". */
  placeFormatted: string;
  /** Present when the result came from forward geocode (no retrieve needed). */
  latitude?: number;
  longitude?: number;
  city?: string;
  address?: string | null;
};

export type PlaceDetails = {
  name: string;
  city: string;
  address: string | null;
  latitude: number;
  longitude: number;
};

export type VenueMatchConfidence = 'confirmed' | 'needs_review' | 'unresolved';

/** Batch geocode result. `city` is always the caller's requested city. */
export type GeocodeResult = {
  name: string;
  city: string;
  mapboxPlace: string | null;
  /** Country name from the geocoder's context, e.g. "Germany". */
  country: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  confidence: VenueMatchConfidence;
};

export function isMapboxConfigured(): boolean {
  return !!env.mapboxToken;
}

// A per-search-session identifier groups suggest+retrieve calls for billing.
export function makeSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

type SuggestResponse = {
  suggestions?: {
    mapbox_id: string;
    name: string;
    place_formatted?: string;
    full_address?: string;
  }[];
};

// Mapbox biases forward/suggest results toward the caller's IP location when no
// `proximity` is supplied — which surfaced same-name venues in the user's home
// city (e.g. the Las Vegas "Fillmore" for a Denver show) and produced false
// "needs review" mismatches. We instead resolve the *requested* city's centre and
// bias toward that, so results land in the right place regardless of where the
// user physically is. Cached per city (null = no hit / not found).
const cityCenterCache = new Map<string, [number, number] | null>();

async function cityCenter(city?: string): Promise<[number, number] | null> {
  const key = (city ?? '').trim().toLowerCase();
  if (!key || !env.mapboxToken) return null;
  if (cityCenterCache.has(key)) return cityCenterCache.get(key) ?? null;

  let center: [number, number] | null = null;
  try {
    const params = new URLSearchParams({
      q: city!.trim(),
      access_token: env.mapboxToken,
      limit: '1',
      types: 'place,locality,region,district',
    });
    const res = await fetch(`${BASE}/forward?${params.toString()}`);
    if (res.ok) {
      const json = (await res.json()) as ForwardResponse;
      const coords = json.features?.[0]?.geometry?.coordinates;
      if (coords) center = [coords[0], coords[1]];
    }
  } catch {
    // Best-effort — fall back to no proximity bias.
  }
  cityCenterCache.set(key, center);
  return center;
}

/** `proximity=lng,lat` for the city, or null. Appended to bias results toward it. */
function proximityParam(center: [number, number] | null): string | null {
  return center ? `${center[0]},${center[1]}` : null;
}

/**
 * Build Mapbox query strings for a venue, trying city with/without accents.
 * City-qualified variants come first (most specific) so a loose chain match in
 * the wrong city can't pre-empt the correct one; the bare venue name is a last
 * resort.
 */
function venueQueryVariants(term: string, city?: string): string[] {
  const queries = new Set<string>();

  for (const cityTerm of citySearchTerms(city ?? '')) {
    queries.add(`${term}, ${cityTerm}`);
    queries.add(`${term} ${cityTerm}`);
  }

  queries.add(term);

  return [...queries];
}

/** Suggest places, optionally biased toward a known city. */
export async function suggestPlaces(
  query: string,
  sessionToken: string,
  city?: string,
): Promise<PlaceSuggestion[]> {
  const term = query.trim();
  if (!env.mapboxToken || term.length < 2) return [];

  // "Montréal, Canada" → try both "Montréal" and "Montreal" as city bias.
  // Plain venue-only query is always included as a fallback.
  const queries = venueQueryVariants(term, city);
  const proximity = proximityParam(await cityCenter(city));

  const unique = new Map<string, PlaceSuggestion>();

  await Promise.all(
    queries.map(async (q) => {
      const params = new URLSearchParams({
        q,
        session_token: sessionToken,
        access_token: env.mapboxToken!,
        limit: '8',
        types: 'poi,address,place',
      });
      if (proximity) params.set('proximity', proximity);
      const res = await fetch(`${BASE}/suggest?${params.toString()}`);
      if (!res.ok) return;

      const json = (await res.json()) as SuggestResponse;
      for (const s of json.suggestions ?? []) {
        if (!s.mapbox_id || unique.has(s.mapbox_id)) continue;
        unique.set(s.mapbox_id, {
          mapboxId: s.mapbox_id,
          name: s.name,
          placeFormatted: s.place_formatted ?? s.full_address ?? '',
        });
      }
    }),
  );

  const results = [...unique.values()];
  const cityPart = citySearchTerms(city ?? '')[0];
  if (!cityPart) return results;

  // Prefer suggestions whose formatted place mentions the requested city.
  return results.sort((a, b) => {
    const aHit = cityMatches(cityPart, a.placeFormatted, a.name) ? 0 : 1;
    const bHit = cityMatches(cityPart, b.placeFormatted, b.name) ? 0 : 1;
    return aHit - bHit;
  });
}

type ForwardFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    full_address?: string;
    address?: string;
    context?: {
      place?: { name?: string };
      locality?: { name?: string };
      region?: { name?: string; region_code?: string };
      country?: { name?: string; country_code?: string };
    };
  };
};

type ForwardResponse = {
  features?: ForwardFeature[];
};

function mapboxPlaceLabel(feature: ForwardFeature): string {
  const ctx = feature.properties?.context ?? {};
  // Prefer city/locality — never treat the state/region alone as the "place"
  // we matched (that produced confusing "Mapbox suggested Florida" warnings).
  return ctx.place?.name ?? ctx.locality?.name ?? '';
}

/** The requested state/region token, if the city string includes one ("Orlando, FL" → "fl"). */
function requestedRegion(requestedCity: string): string {
  const parts = requestedCity.split(',');
  return parts.length > 1 ? normalizePlace(parts.slice(1).join(' ')) : '';
}

/** Whether a feature's region agrees with the requested state (name or code). */
function regionMatches(requestedCity: string, feature: ForwardFeature): boolean {
  const req = requestedRegion(requestedCity);
  if (!req) return true; // No state given — nothing to disqualify on.
  const region = feature.properties?.context?.region;
  const candidates = [region?.name, region?.region_code]
    .filter((v): v is string => !!v)
    .map(normalizePlace);
  return candidates.some((c) => c === req);
}

/** First feature that actually sits in the requested city, if any. */
function findCityMatch(features: ForwardFeature[], requestedCity: string): ForwardFeature | null {
  for (const feature of features) {
    const place = mapboxPlaceLabel(feature);
    const full = feature.properties?.full_address ?? feature.properties?.address ?? '';
    const region = feature.properties?.context?.region?.name ?? '';
    if (cityMatches(requestedCity, place, full, region)) return feature;
  }
  return null;
}

/**
 * A "close but unconfirmed" candidate to surface for review. We only suggest one
 * when it plausibly refers to the same place — i.e. it's in the requested state
 * (when one was given). This avoids the confusing "Mapbox suggested Wheatland,
 * CA" for an Orlando, FL show.
 */
function pickFallback(
  features: ForwardFeature[],
  requestedCity: string,
): ForwardFeature | null {
  const candidate = features.find((f) => !!mapboxPlaceLabel(f));
  if (!candidate) return null;
  if (!regionMatches(requestedCity, candidate)) return null;
  return candidate;
}

function buildGeocodeResult(
  feature: ForwardFeature,
  confidence: VenueMatchConfidence,
  requestedCity: string,
  venueName: string,
): GeocodeResult {
  const [longitude, latitude] = feature.geometry.coordinates;
  const props = feature.properties ?? {};
  const mapboxPlace = mapboxPlaceLabel(feature);
  return {
    name: props.name || venueName || requestedCity,
    city: requestedCity || mapboxPlace,
    mapboxPlace: mapboxPlace || null,
    country: feature.properties?.context?.country?.name ?? null,
    address: props.full_address ?? props.address ?? null,
    latitude: confidence === 'confirmed' ? latitude : null,
    longitude: confidence === 'confirmed' ? longitude : null,
    confidence,
  };
}

/** Forward-geocode search for the place picker when suggest (typeahead) returns nothing. */
export async function forwardSearchPlaces(
  query: string,
  city?: string,
): Promise<PlaceSuggestion[]> {
  const term = query.trim();
  if (!env.mapboxToken || term.length < 2) return [];

  const queries = venueQueryVariants(term, city);
  const proximity = proximityParam(await cityCenter(city));
  const unique = new Map<string, PlaceSuggestion>();

  for (const q of queries) {
    const params = new URLSearchParams({
      q,
      access_token: env.mapboxToken,
      limit: '5',
      types: 'poi,address,place',
    });
    if (proximity) params.set('proximity', proximity);
    const res = await fetch(`${BASE}/forward?${params.toString()}`);
    if (!res.ok) continue;

    const json = (await res.json()) as ForwardResponse;
    for (const [index, feature] of (json.features ?? []).entries()) {
      const props = feature.properties ?? {};
      const name = props.name || term;
      const place = mapboxPlaceLabel(feature);
      const full = props.full_address ?? props.address ?? place;
      const [longitude, latitude] = feature.geometry.coordinates;
      // Forward features don't always expose mapbox_id; synthesize a stable key.
      const id = `forward:${q}:${name}:${full}:${index}`;
      if (unique.has(id)) continue;
      unique.set(id, {
        mapboxId: id,
        name,
        placeFormatted: full || place,
        latitude,
        longitude,
        city: place,
        address: full || null,
      });
    }
    if (unique.size > 0) break;
  }

  const results = [...unique.values()];
  const cityPart = citySearchTerms(city ?? '')[0];
  if (!cityPart) return results;
  return results.sort((a, b) => {
    const aHit = cityMatches(cityPart, a.placeFormatted, a.name) ? 0 : 1;
    const bHit = cityMatches(cityPart, b.placeFormatted, b.name) ? 0 : 1;
    return aHit - bHit;
  });
}

/** Suggest first; if empty, fall back to forward geocode (better for complete names). */
export async function searchPlaces(
  query: string,
  sessionToken: string,
  city?: string,
): Promise<PlaceSuggestion[]> {
  const suggested = await suggestPlaces(query, sessionToken, city);
  if (suggested.length > 0) return suggested;
  return forwardSearchPlaces(query, city);
}

// One-shot forward geocode for batch use (e.g. AI import). Never overwrites the
// requested city; coords are only returned when Mapbox agrees on the city.
export async function geocodeVenue(
  name: string,
  city: string,
  address?: string | null,
): Promise<GeocodeResult | null> {
  const requestedCity = city.trim();
  const venueName = name.trim();
  const street = address?.trim();

  const cityTerms = citySearchTerms(requestedCity);
  const queries = [
    ...(street
      ? cityTerms.flatMap((c) => [`${street}, ${c}`, `${street} ${c}`])
      : []),
    ...venueQueryVariants(venueName, requestedCity),
    ...cityTerms,
  ].filter((q, index, arr) => q.length >= 2 && arr.indexOf(q) === index);

  if (!env.mapboxToken || queries.length === 0) return null;

  // Bias toward the requested city's centre so we don't get the same-name venue
  // in the user's home city (the Las Vegas vs. Denver "Fillmore" problem).
  const proximity = proximityParam(await cityCenter(requestedCity));

  // Search every query for a real city match before settling — a loose match in
  // the wrong city (e.g. a chain venue) must not short-circuit the correct one.
  let fallback: ForwardFeature | null = null;

  for (const query of queries) {
    const params = new URLSearchParams({
      q: query,
      access_token: env.mapboxToken,
      limit: '5',
      types: 'poi,address,place',
    });
    if (proximity) params.set('proximity', proximity);
    const res = await fetch(`${BASE}/forward?${params.toString()}`);
    if (!res.ok) continue;

    const json = (await res.json()) as ForwardResponse;
    const features = json.features ?? [];
    if (features.length === 0) continue;

    const match = findCityMatch(features, requestedCity);
    if (match) return buildGeocodeResult(match, 'confirmed', requestedCity, venueName);

    // Remember the first plausible (same-state) candidate, but keep searching
    // the remaining, more-specific queries for an actual city match.
    if (!fallback) fallback = pickFallback(features, requestedCity);
  }

  if (fallback) return buildGeocodeResult(fallback, 'needs_review', requestedCity, venueName);

  return {
    name: venueName || requestedCity,
    city: requestedCity,
    mapboxPlace: null,
    country: null,
    address: street || null,
    latitude: null,
    longitude: null,
    confidence: 'unresolved',
  };
}

type RetrieveResponse = {
  features?: {
    geometry: { coordinates: [number, number] };
    properties: {
      name?: string;
      full_address?: string;
      address?: string;
      context?: {
        place?: { name?: string };
        locality?: { name?: string };
        region?: { name?: string };
      };
    };
  }[];
};

/**
 * Reverse-geocode a coordinate to its country name. Used to backfill
 * `venues.country` for stops whose city string is bare ("Berlin") and never
 * carried a country at insert time.
 */
export async function reverseGeocodeCountry(
  longitude: number,
  latitude: number,
): Promise<string | null> {
  if (!env.mapboxToken) return null;
  const params = new URLSearchParams({
    access_token: env.mapboxToken,
    types: 'country',
    limit: '1',
  });
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?${params}`,
  );
  if (!res.ok) return null;
  const json = (await res.json()) as {
    features?: { text?: string; place_name?: string }[];
  };
  const feature = json.features?.[0];
  return feature?.text?.trim() || feature?.place_name?.trim() || null;
}

export async function retrievePlace(
  mapboxId: string,
  sessionToken: string,
): Promise<PlaceDetails | null> {
  if (!env.mapboxToken) return null;

  const params = new URLSearchParams({
    session_token: sessionToken,
    access_token: env.mapboxToken,
  });
  const res = await fetch(`${BASE}/retrieve/${mapboxId}?${params.toString()}`);
  if (!res.ok) throw new Error('Place lookup failed');

  const json = (await res.json()) as RetrieveResponse;
  const feature = json.features?.[0];
  if (!feature) return null;

  const [longitude, latitude] = feature.geometry.coordinates;
  const props = feature.properties ?? {};
  const context = props.context ?? {};
  const city = context.place?.name ?? context.locality?.name ?? context.region?.name ?? '';

  return {
    name: props.name ?? '',
    city,
    address: props.full_address ?? props.address ?? null,
    latitude,
    longitude,
  };
}
