// Great-circle distance and display helpers for tour stats. Segments use
// haversine (straight-line) miles — a good proxy for travel until we add
// Mapbox driving directions.

export const EARTH_CIRCUMFERENCE_MILES = 24_901;
// Mean Earth–Moon distance and one astronomical unit (Earth–Sun), in miles.
export const MOON_DISTANCE_MILES = 238_855;
export const SUN_DISTANCE_MILES = 92_955_807;
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

/**
 * Samples extra points along a polyline so each segment is broken into ~stepMiles
 * chunks. Used to turn route lines into a dense point cloud for a heatmap — where
 * routes overlap, the sampled points pile up and the heat reads hotter.
 */
export function densifyPath(
  coords: [number, number][],
  stepMiles: number,
): [number, number][] {
  if (coords.length === 0) return [];
  const step = stepMiles > 0 ? stepMiles : 25;
  const out: [number, number][] = [coords[0]];
  for (let i = 0; i < coords.length - 1; i += 1) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[i + 1];
    const miles = haversineMiles(lat1, lng1, lat2, lng2);
    const steps = Math.max(1, Math.round(miles / step));
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      out.push([lng1 + (lng2 - lng1) * t, lat1 + (lat2 - lat1) * t]);
    }
  }
  return out;
}

/**
 * Points along a quadratic-Bézier arc between two [lng, lat] points. The arc bows
 * out from the straight line by `curvature` × segment length, always toward the
 * higher-latitude side, so routes read like flight paths. Aesthetic (planar), not
 * a true great circle.
 */
export function arcBetween(
  a: [number, number],
  b: [number, number],
  curvature: number,
  segments: number,
): [number, number][] {
  const steps = Math.max(1, Math.round(segments));
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [a, b];

  // Unit perpendicular, oriented to bow "up" (toward increasing latitude).
  let px = -dy / len;
  let py = dx / len;
  if (py < 0) {
    px = -px;
    py = -py;
  }

  const offset = curvature * len;
  const cx = (ax + bx) / 2 + px * offset;
  const cy = (ay + by) / 2 + py * offset;

  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt * mt * ax + 2 * mt * t * cx + t * t * bx;
    const y = mt * mt * ay + 2 * mt * t * cy + t * t * by;
    points.push([x, y]);
  }
  return points;
}

/** Arcs every segment of an ordered path and joins them into one polyline. */
export function arcedPath(
  coords: [number, number][],
  curvature: number,
  segments: number,
): [number, number][] {
  if (coords.length < 2) return coords;
  const out: [number, number][] = [coords[0]];
  for (let i = 0; i < coords.length - 1; i += 1) {
    const arc = arcBetween(coords[i], coords[i + 1], curvature, segments);
    for (let j = 1; j < arc.length; j += 1) out.push(arc[j]);
  }
  return out;
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

/**
 * Expresses a distance as a fraction of some cosmic target (Earth circumference,
 * Moon, Sun) — as a multiplier once it's lapped the target (e.g. "2.3×"), or a
 * percentage of the way there otherwise ("4%", "0.02%").
 */
export function formatTripFraction(miles: number, target: number): string {
  if (!Number.isFinite(miles) || miles <= 0 || target <= 0) return '0%';
  const ratio = miles / target;
  if (ratio >= 1) return ratio < 10 ? `${ratio.toFixed(2)}×` : `${ratio.toFixed(1)}×`;
  const pct = ratio * 100;
  if (pct >= 1) return `${Math.round(pct)}%`;
  if (pct >= 0.01) return `${pct.toFixed(2)}%`;
  return '<0.01%';
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
