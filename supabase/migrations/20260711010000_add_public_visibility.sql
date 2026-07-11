-- Add a 'public' visibility so tours can form a shared, discoverable catalog.
--
-- This lives in its own migration because a newly added enum value cannot be
-- used in the same transaction that introduces it.
alter type visibility add value if not exists 'public';
