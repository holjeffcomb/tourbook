-- Performance indexes for scale (foreign keys used by RLS + venue search).
--
-- All additive and idempotent: no schema/type changes, so generated types are
-- unaffected. On a large production table prefer CREATE INDEX CONCURRENTLY (run
-- outside a migration transaction); at current data sizes a plain create is fine.

-- `created_by` drives the friends-visibility RLS check (public.is_friends on the
-- tour creator) and the creator-owns-writes policies, but has no index. (The old
-- tours_user_id_idx was dropped with the user_id column in the shared-tours
-- refactor.) acts/venues.created_by are unindexed foreign keys.
create index if not exists tours_created_by_idx on tours (created_by);
create index if not exists acts_created_by_idx on acts (created_by);
create index if not exists venues_created_by_idx on venues (created_by);

-- Venue search (`search_venues`) matches with leading-wildcard ILIKE
-- ('%term%'), which a btree index can't accelerate. Trigram GIN indexes make it
-- scale as the shared venue catalog grows.
create extension if not exists pg_trgm with schema extensions;
create index if not exists venues_name_trgm_idx on venues using gin (name gin_trgm_ops);
create index if not exists venues_city_trgm_idx on venues using gin (city gin_trgm_ops);
