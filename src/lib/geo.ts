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

// Common aliases plus the full ISO 3166-1 alpha-2 set, so cities stored as
// "City, XX" resolve to a country regardless of where the tour went. US states
// and CA provinces are matched first (above) so overlaps like CA resolve there.
const REGION_TO_COUNTRY: Record<string, string> = {
  USA: 'United States',
  UK: 'United Kingdom',
  UAE: 'United Arab Emirates',
  AF: 'Afghanistan', AX: 'Åland Islands', AL: 'Albania', DZ: 'Algeria', AS: 'American Samoa',
  AD: 'Andorra', AO: 'Angola', AI: 'Anguilla', AG: 'Antigua and Barbuda', AR: 'Argentina',
  AM: 'Armenia', AW: 'Aruba', AU: 'Australia', AT: 'Austria', AZ: 'Azerbaijan',
  BS: 'Bahamas', BH: 'Bahrain', BD: 'Bangladesh', BB: 'Barbados', BY: 'Belarus',
  BE: 'Belgium', BZ: 'Belize', BJ: 'Benin', BM: 'Bermuda', BT: 'Bhutan',
  BO: 'Bolivia', BA: 'Bosnia and Herzegovina', BW: 'Botswana', BR: 'Brazil', BN: 'Brunei',
  BG: 'Bulgaria', BF: 'Burkina Faso', BI: 'Burundi', KH: 'Cambodia', CM: 'Cameroon',
  CV: 'Cape Verde', KY: 'Cayman Islands', CF: 'Central African Republic', TD: 'Chad', CL: 'Chile',
  CN: 'China', CO: 'Colombia', KM: 'Comoros', CG: 'Congo', CD: 'DR Congo',
  CR: 'Costa Rica', CI: 'Côte d’Ivoire', HR: 'Croatia', CU: 'Cuba', CW: 'Curaçao',
  CY: 'Cyprus', CZ: 'Czech Republic', DK: 'Denmark', DJ: 'Djibouti', DM: 'Dominica',
  DO: 'Dominican Republic', EC: 'Ecuador', EG: 'Egypt', SV: 'El Salvador', GQ: 'Equatorial Guinea',
  ER: 'Eritrea', EE: 'Estonia', SZ: 'Eswatini', ET: 'Ethiopia', FO: 'Faroe Islands',
  FJ: 'Fiji', FI: 'Finland', FR: 'France', GF: 'French Guiana', PF: 'French Polynesia',
  GA: 'Gabon', GM: 'Gambia', GE: 'Georgia', DE: 'Germany', GH: 'Ghana',
  GI: 'Gibraltar', GR: 'Greece', GL: 'Greenland', GD: 'Grenada', GP: 'Guadeloupe',
  GU: 'Guam', GT: 'Guatemala', GG: 'Guernsey', GN: 'Guinea', GW: 'Guinea-Bissau',
  GY: 'Guyana', HT: 'Haiti', HN: 'Honduras', HK: 'Hong Kong', HU: 'Hungary',
  IS: 'Iceland', IN: 'India', ID: 'Indonesia', IR: 'Iran', IQ: 'Iraq',
  IE: 'Ireland', IM: 'Isle of Man', IL: 'Israel', IT: 'Italy', JM: 'Jamaica',
  JP: 'Japan', JE: 'Jersey', JO: 'Jordan', KZ: 'Kazakhstan', KE: 'Kenya',
  KI: 'Kiribati', KW: 'Kuwait', KG: 'Kyrgyzstan', LA: 'Laos', LV: 'Latvia',
  LB: 'Lebanon', LS: 'Lesotho', LR: 'Liberia', LY: 'Libya', LI: 'Liechtenstein',
  LT: 'Lithuania', LU: 'Luxembourg', MO: 'Macau', MG: 'Madagascar', MW: 'Malawi',
  MY: 'Malaysia', MV: 'Maldives', ML: 'Mali', MT: 'Malta', MH: 'Marshall Islands',
  MQ: 'Martinique', MR: 'Mauritania', MU: 'Mauritius', MX: 'Mexico', FM: 'Micronesia',
  MD: 'Moldova', MC: 'Monaco', MN: 'Mongolia', ME: 'Montenegro', MS: 'Montserrat',
  MA: 'Morocco', MZ: 'Mozambique', MM: 'Myanmar', NA: 'Namibia', NR: 'Nauru',
  NP: 'Nepal', NL: 'Netherlands', NC: 'New Caledonia', NZ: 'New Zealand', NI: 'Nicaragua',
  NE: 'Niger', NG: 'Nigeria', MK: 'North Macedonia', NO: 'Norway', OM: 'Oman',
  PK: 'Pakistan', PW: 'Palau', PS: 'Palestine', PA: 'Panama', PG: 'Papua New Guinea',
  PY: 'Paraguay', PE: 'Peru', PH: 'Philippines', PL: 'Poland', PT: 'Portugal',
  PR: 'Puerto Rico', QA: 'Qatar', RE: 'Réunion', RO: 'Romania', RU: 'Russia',
  RW: 'Rwanda', WS: 'Samoa', SM: 'San Marino', SA: 'Saudi Arabia', SN: 'Senegal',
  RS: 'Serbia', SC: 'Seychelles', SL: 'Sierra Leone', SG: 'Singapore', SK: 'Slovakia',
  SI: 'Slovenia', SB: 'Solomon Islands', SO: 'Somalia', ZA: 'South Africa', KR: 'South Korea',
  SS: 'South Sudan', ES: 'Spain', LK: 'Sri Lanka', SD: 'Sudan', SR: 'Suriname',
  SE: 'Sweden', CH: 'Switzerland', SY: 'Syria', TW: 'Taiwan', TJ: 'Tajikistan',
  TZ: 'Tanzania', TH: 'Thailand', TL: 'Timor-Leste', TG: 'Togo', TO: 'Tonga',
  TT: 'Trinidad and Tobago', TN: 'Tunisia', TR: 'Turkey', TM: 'Turkmenistan', TV: 'Tuvalu',
  UG: 'Uganda', UA: 'Ukraine', AE: 'United Arab Emirates', GB: 'United Kingdom', US: 'United States',
  UY: 'Uruguay', UZ: 'Uzbekistan', VU: 'Vanuatu', VA: 'Vatican City', VE: 'Venezuela',
  VN: 'Vietnam', VG: 'British Virgin Islands', VI: 'U.S. Virgin Islands', YE: 'Yemen',
  ZM: 'Zambia', ZW: 'Zimbabwe',
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
 * Overview framing for Lifetime / tour lists: keep the geographic center of
 * *all* points, but size the zoom from the closest `keepFraction` (default 80%)
 * so roughly 20% of the farthest outliers can sit outside the frame.
 *
 * Example: points across the US and Europe → center over the mid-Atlantic,
 * zoomed in enough that some edge pins may clip rather than fitting the world.
 */
export function trimmedOverviewFrame(
  coords: [number, number][],
  keepFraction = 0.8,
): {
  center: [number, number];
  ne: [number, number];
  sw: [number, number];
} {
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const center: [number, number] = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];

  if (coords.length <= 2) {
    return {
      center,
      ne: [maxLng, maxLat],
      sw: [minLng, minLat],
    };
  }

  const ranked = coords
    .map((c) => ({
      c,
      d: haversineMiles(center[1], center[0], c[1], c[0]),
    }))
    .sort((a, b) => a.d - b.d);

  const keepCount = Math.max(2, Math.ceil(coords.length * keepFraction));
  const kept = ranked.slice(0, Math.min(keepCount, ranked.length)).map((r) => r.c);
  const kLngs = kept.map((c) => c[0]);
  const kLats = kept.map((c) => c[1]);

  return {
    center,
    ne: [Math.max(...kLngs), Math.max(...kLats)],
    sw: [Math.min(...kLngs), Math.min(...kLats)],
  };
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
