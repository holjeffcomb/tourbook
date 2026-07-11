import { env } from '@/lib/env';

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
};

export type PlaceDetails = {
  name: string;
  city: string;
  address: string | null;
  latitude: number;
  longitude: number;
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

export async function suggestPlaces(
  query: string,
  sessionToken: string,
): Promise<PlaceSuggestion[]> {
  const term = query.trim();
  if (!env.mapboxToken || term.length < 2) return [];

  const params = new URLSearchParams({
    q: term,
    session_token: sessionToken,
    access_token: env.mapboxToken,
    limit: '8',
    types: 'poi,address,place',
  });
  const res = await fetch(`${BASE}/suggest?${params.toString()}`);
  if (!res.ok) throw new Error('Place search failed');

  const json = (await res.json()) as SuggestResponse;
  return (json.suggestions ?? []).map((s) => ({
    mapboxId: s.mapbox_id,
    name: s.name,
    placeFormatted: s.place_formatted ?? s.full_address ?? '',
  }));
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
