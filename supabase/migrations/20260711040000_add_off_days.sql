-- Turn a tour's shows into a general itinerary of "stops": each stop is either a
-- performance ('show', with a venue) or an 'off' day (travel/rest, no venue,
-- with an optional geocoded location for the map).
--
-- The table keeps its name (`shows`) to avoid a churny rename; the app refers to
-- rows as "stops". Existing rows default to 'show', so nothing changes for them.

create type stop_kind as enum ('show', 'off');

alter table shows add column kind stop_kind not null default 'show';

-- Off days have no venue; shows still always reference one.
alter table shows alter column venue_id drop not null;

-- Inline location for off days (shows derive their location from their venue).
-- label doubles as an optional note, e.g. "Travel day".
alter table shows add column label text;
alter table shows add column city text;
alter table shows add column latitude double precision;
alter table shows add column longitude double precision;

-- Enforce the invariant: shows have a venue and no inline location; off days
-- have inline location fields and no venue.
alter table shows add constraint shows_kind_venue_check
  check (
    (kind = 'show' and venue_id is not null)
    or (kind = 'off' and venue_id is null)
  );
