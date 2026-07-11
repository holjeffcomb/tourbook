-- Restore the standard Supabase API-role privileges on the public schema.
--
-- These schema-level GRANTs were lost during a local stack upgrade, surfacing as
-- "permission denied for table ..." errors even though RLS policies were intact.
-- GRANTs make a table reachable by a role; RLS policies then decide which rows
-- that role may actually see or change. Both are required. Row-level protection
-- is still fully enforced by the policies defined in earlier migrations.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete
  on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select
  on all sequences in schema public
  to anon, authenticated, service_role;

grant execute
  on all routines in schema public
  to anon, authenticated, service_role;

-- Ensure objects created by future migrations inherit the same access.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

alter default privileges in schema public
  grant execute on routines to anon, authenticated, service_role;
