// Great-circle distance and display helpers for tour stats. Segments use
// haversine (straight-line) miles — a good proxy for travel until we add
// Mapbox driving directions.

export const EARTH_CIRCUMFERENCE_MILES = 24_901;
export const WORLD_COUNTRY_COUNT = 195;

const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY',
  'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
  'WI', 'WY', 'DC',
]);

const CA_PROVINCES = new Set([
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
]);

const REGION_TO_COUNTRY: Record<string, string> = {
  US: 'United States',
  USA: 'United States',
  UK: 'United Kingdom',
  GB: 'United Kingdom',
  AU: 'Australia',
  NZ: 'New Zealand',
  IE: 'Ireland',
  DE: 'Germany',
  FR: 'France',
  ES: 'Spain',
  IT: 'Italy',
  NL: 'Netherlands',
  BE: 'Belgium',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  FI: 'Finland',
  JP: 'Japan',
  MX: 'Mexico',
  BR: 'Brazil',
};

/** Great-circle distance in miles between two WGS84 points. */
export function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatMiles(miles: number): string {
  if (!Number.isFinite(miles) || miles <= 0) return '0 mi';
  if (miles < 100) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles).toLocaleString()} mi`;
}

export function formatEarthLaps(miles: number): string {
  if (!Number.isFinite(miles) || miles <= 0) return '0×';
  const laps = miles / EARTH_CIRCUMFERENCE_MILES;
  if (laps < 0.01) return '<0.01×';
  if (laps < 10) return `${laps.toFixed(2)}×`;
  return `${laps.toFixed(1)}×`;
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0%';
  if (value >= 10) return `${Math.round(value)}%`;
  return `${value.toFixed(1)}%`;
}

/** Normalize a city string for deduplication (lowercase, trimmed). */
export function normalizePlaceKey(value: string): string {
  return value.trim().toLowerCase();
}

// Best-effort country from a city string like "Morrison, CO" or "London, UK".
// Returns null when the country can't be inferred — common for bare city names.
export function inferCountryFromCity(city: string): string | null {
  const trimmed = city.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const last = parts[parts.length - 1].toUpperCase();
  if (US_STATES.has(last)) return 'United States';
  if (CA_PROVINCES.has(last)) return 'Canada';
  if (REGION_TO_COUNTRY[last]) return REGION_TO_COUNTRY[last];

  // Longer tail like "United States" or "Germany".
  if (parts.length >= 2 && parts[parts.length - 1].length > 3) {
    return parts[parts.length - 1];
  }

  return null;
}
