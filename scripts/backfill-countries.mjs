// One-off maintenance script: backfill `country` for rows that were created
// before geocoding moved to the write path (Phase 3).
//
// It fills:
//   * venues.country   — booked venues that have coordinates but no country
//   * shows.country     — inline city-only / off-day stops (venue_id is null)
//                         that have coordinates but no country
//
// The country is reverse-geocoded from stored coordinates using the same Mapbox
// endpoint the app used (`mapbox.places` reverse, types=country). Rows without
// coordinates are left untouched — there's nothing to geocode from.
//
// Usage (run once, from the repo root):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... MAPBOX_TOKEN=... \
//     node scripts/backfill-countries.mjs [--dry-run]
//
// Env vars (each falls back to the app's EXPO_PUBLIC_* equivalent, and a `.env`
// file at the repo root is loaded automatically if present):
//   SUPABASE_URL              (or EXPO_PUBLIC_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY (or EXPO_PUBLIC_SUPABASE_ANON_KEY — but the service
//                              role key is strongly preferred so RLS doesn't hide
//                              other users' rows)
//   MAPBOX_TOKEN              (or EXPO_PUBLIC_MAPBOX_TOKEN)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Minimal .env loader so this runs without adding a dotenv dependency. Only
// fills vars that aren't already set in the environment.
function loadDotEnv() {
  try {
    const raw = readFileSync(resolve(__dirname, '..', '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const key = match[1];
      if (process.env[key] !== undefined) continue;
      let value = match[2];
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // No .env file — rely on the ambient environment.
  }
}

loadDotEnv();

const DRY_RUN = process.argv.includes('--dry-run');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

if (!SUPABASE_URL || !SUPABASE_KEY || !MAPBOX_TOKEN) {
  console.error(
    'Missing config. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and MAPBOX_TOKEN (or their EXPO_PUBLIC_* equivalents).',
  );
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    'WARNING: using the anon key. Row-level security will hide rows you do not own, so the backfill may be incomplete. Prefer SUPABASE_SERVICE_ROLE_KEY.',
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mirror of src/lib/mapbox.ts `reverseGeocodeCountry` so this backfill produces
// the same values the write path now stores.
async function reverseGeocodeCountry(longitude, latitude) {
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    types: 'country',
    limit: '1',
  });
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?${params}`,
  );
  if (!res.ok) return null;
  const json = await res.json();
  const feature = json.features?.[0];
  return feature?.text?.trim() || feature?.place_name?.trim() || null;
}

// Cache by rounded coordinate — a country boundary is coarse enough that ~4
// decimals (≈11m) is plenty, and touring data repeats coordinates a lot.
const countryCache = new Map();
async function cachedCountry(longitude, latitude) {
  const key = `${longitude.toFixed(4)},${latitude.toFixed(4)}`;
  if (countryCache.has(key)) return countryCache.get(key);
  const country = await reverseGeocodeCountry(longitude, latitude);
  countryCache.set(key, country);
  // Be gentle with the geocoding API.
  await sleep(120);
  return country;
}

async function backfillTable(table, extraFilter) {
  console.log(`\n=== ${table} ===`);
  let query = supabase
    .from(table)
    .select('id, latitude, longitude, country')
    .is('country', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);
  if (extraFilter) query = extraFilter(query);

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  console.log(`${rows.length} row(s) missing country with coordinates.`);

  let updated = 0;
  let unresolved = 0;
  for (const row of rows) {
    const country = await cachedCountry(row.longitude, row.latitude);
    if (!country) {
      unresolved += 1;
      continue;
    }
    if (DRY_RUN) {
      console.log(`[dry-run] ${table} ${row.id} -> ${country}`);
      updated += 1;
      continue;
    }
    const { error: updateError } = await supabase
      .from(table)
      .update({ country })
      .eq('id', row.id);
    if (updateError) {
      console.error(`Failed to update ${table} ${row.id}:`, updateError.message);
      continue;
    }
    updated += 1;
  }

  console.log(`${DRY_RUN ? 'Would update' : 'Updated'}: ${updated}. Unresolved: ${unresolved}.`);
}

async function main() {
  console.log(`Backfilling countries${DRY_RUN ? ' (dry run)' : ''}...`);
  await backfillTable('venues');
  // Inline stops only — booked stops read their country from the venue row.
  await backfillTable('shows', (q) => q.is('venue_id', null));
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
