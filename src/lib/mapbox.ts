import { env } from '@/lib/env';
import { cityMatches, citySearchTerms } from '@/lib/cityMatch';

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

/** Build Mapbox query strings for a venue, trying city with/without accents. */
function venueQueryVariants(term: string, city?: string): string[] {
  const queries = new Set<string>();
  queries.add(term);

  for (const cityTerm of citySearchTerms(city ?? '')) {
    queries.add(`${term}, ${cityTerm}`);
    queries.add(`${term} ${cityTerm}`);
  }

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
      region?: { name?: string };
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

function pickInCity(
  features: ForwardFeature[],
  requestedCity: string,
): { feature: ForwardFeature; confidence: VenueMatchConfidence } | null {
  if (features.length === 0) return null;

  for (const feature of features) {
    const place = mapboxPlaceLabel(feature);
    const full = feature.properties?.full_address ?? feature.properties?.address ?? '';
    const region = feature.properties?.context?.region?.name ?? '';
    if (cityMatches(requestedCity, place, full, region)) {
      return { feature, confidence: 'confirmed' };
    }
  }

  // Prefer a POI/address that at least has a city label over a bare region hit.
  const topWithPlace =
    features.find((f) => !!mapboxPlaceLabel(f)) ?? features[0];
  const topPlace = mapboxPlaceLabel(topWithPlace);
  if (topPlace) {
    return { feature: topWithPlace, confidence: 'needs_review' };
  }
  return { feature: topWithPlace, confidence: 'unresolved' };
}

/** Forward-geocode search for the place picker when suggest (typeahead) returns nothing. */
export async function forwardSearchPlaces(
  query: string,
  city?: string,
): Promise<PlaceSuggestion[]> {
  const term = query.trim();
  if (!env.mapboxToken || term.length < 2) return [];

  const queries = venueQueryVariants(term, city);
  const unique = new Map<string, PlaceSuggestion>();

  for (const q of queries) {
    const params = new URLSearchParams({
      q,
      access_token: env.mapboxToken,
      limit: '5',
      types: 'poi,address,place',
    });
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

  for (const query of queries) {
    const params = new URLSearchParams({
      q: query,
      access_token: env.mapboxToken,
      limit: '5',
      types: 'poi,address,place',
    });
    const res = await fetch(`${BASE}/forward?${params.toString()}`);
    if (!res.ok) continue;

    const json = (await res.json()) as ForwardResponse;
    const picked = pickInCity(json.features ?? [], requestedCity);
    if (!picked) continue;

    const [longitude, latitude] = picked.feature.geometry.coordinates;
    const props = picked.feature.properties ?? {};
    const mapboxPlace = mapboxPlaceLabel(picked.feature);
    const fullAddress = props.full_address ?? props.address ?? null;

    return {
      name: props.name || venueName || requestedCity,
      city: requestedCity || mapboxPlace,
      mapboxPlace: mapboxPlace || null,
      address: fullAddress,
      latitude: picked.confidence === 'confirmed' ? latitude : null,
      longitude: picked.confidence === 'confirmed' ? longitude : null,
      confidence: picked.confidence,
    };
  }

  return {
    name: venueName || requestedCity,
    city: requestedCity,
    mapboxPlace: null,
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
