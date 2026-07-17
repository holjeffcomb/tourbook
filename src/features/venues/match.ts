// Pure venue-matching helpers, kept free of the supabase/env import chain so
// they're unit-testable in isolation.

// Mirrors the DB's generated normalized columns (lower(btrim(...))) so client
// lookups match the unique (normalized_name, normalized_city) dedup key.
export function normalize(value: string) {
  return value.trim().toLowerCase();
}

/**
 * Cities are "compatible" when one is the same place expressed more or less
 * specifically — identical after normalization, or the shorter string is the
 * leading token of the longer (so a stored "Hamburg" matches a parsed
 * "Hamburg, DE"). The boundary check (comma/space) prevents "Hamburg" from
 * matching "Hamburgo".
 */
export function citiesCompatible(a: string, b: string): boolean {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return long.startsWith(`${short},`) || long.startsWith(`${short} `);
}
