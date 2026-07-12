/** Strip diacritics only (keeps casing) — "Montréal" → "Montreal". */
export function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Lowercase, strip diacritics/periods so "St Petersburg" matches "St. Petersburg" / "Montréal". */
export function normalizePlace(value: string): string {
  return stripDiacritics(value)
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');
}

/**
 * City name variants useful for Mapbox queries.
 * "Montréal, Canada" → ["Montréal", "Montreal"]
 */
export function citySearchTerms(city: string): string[] {
  const primary = city.split(',')[0]?.trim() ?? '';
  if (!primary) return [];

  const ascii = stripDiacritics(primary).replace(/\./g, '').replace(/\s+/g, ' ').trim();
  const terms = [primary];
  if (ascii && ascii !== primary) terms.push(ascii);
  return terms;
}

/**
 * Whether Mapbox result text plausibly refers to the requested city.
 * Compares the city portion before an optional comma (e.g. "Philadelphia, PA" → Philadelphia).
 */
export function cityMatches(
  requestedCity: string,
  ...mapboxText: (string | null | undefined)[]
): boolean {
  const req = normalizePlace(requestedCity.split(',')[0] ?? '');
  if (!req) return true;

  const haystack = normalizePlace(mapboxText.filter(Boolean).join(' '));
  if (!haystack) return false;

  // Whole-token match so "Portland" doesn't match "South Portland".
  const pattern = new RegExp(`(?:^|[\\s,])${escapeRegex(req)}(?:[\\s,]|$)`);
  return pattern.test(haystack);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
