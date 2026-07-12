-- Loosen a stop's location model so it can be less specific than a booked venue:
--   * booked show  -> venue_id references the shared `venues` table
--   * city-only show (venue TBD) -> inline city/coords, venue_id null
--   * off day (city or hotel/address) -> inline location, venue_id null
--
-- The only hard invariant left is that off days never reference a venue (they're
-- not performances). Shows may or may not have one.

alter table shows drop constraint shows_kind_venue_check;

alter table shows add constraint shows_off_no_venue_check
  check (kind = 'show' or venue_id is null);

-- Optional street address for an inline location (e.g. an off-day hotel), mirroring
-- venues.address. Shows with a booked venue leave this null and use the venue.
alter table shows add column address text;
