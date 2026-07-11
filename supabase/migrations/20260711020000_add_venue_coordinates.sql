-- Give venues real geographic coordinates so shows can be placed on a map and
-- connected into a tour route. Existing venues (free-text city only) keep null
-- coordinates until they're geocoded; the map simply skips venues without them.
alter table venues
  add column latitude double precision,
  add column longitude double precision,
  add column address text;
