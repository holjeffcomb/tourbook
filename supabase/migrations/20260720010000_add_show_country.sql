-- Store the country for inline (city-only / off-day) stops, captured from the
-- geocoder at write time. Booked venues already carry `venues.country`; this is
-- the equivalent column for stops that have no venue row.
--
-- Previously the country for these stops was reverse-geocoded on every tour
-- load (never persisted), which put an external API call on the read path.
-- Persisting it here lets the "countries visited" stat read stored data instead.
alter table shows
  add column country text;
