-- Store each venue's country, captured from Mapbox at geocode time. The
-- "countries visited" stat previously parsed it out of the free-text `city`
-- string, which frequently omits the country entirely (e.g. "Berlin" on a Euro
-- tour), so most stops resolved to no country. Persisting the geocoder's country
-- lets stats count it reliably. Existing venues stay null until backfilled
-- (scripts/backfill-venue-countries.mjs) or re-imported.
alter table venues
  add column country text;
