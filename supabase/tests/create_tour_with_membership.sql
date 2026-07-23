-- Regression harness for the create_tour_with_membership vulnerability
-- (docs/design/offline-write-support.md §"Multi-row writes must be atomic";
--  migration supabase/migrations/20260723000000_create_tour_with_membership.sql).
--
-- Proves the SECURITY DEFINER create RPC only ever grants membership for a tour THIS call
-- creates:
--   1. Creating a new tour makes exactly one tour and one membership (the creator).
--   2. Replaying the same create is idempotent (still one tour, one membership).
--   3. Attaching to an existing tour you don't own is rejected and grants NO access.
--
-- Run against a local Supabase DB:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/create_tour_with_membership.sql
--
-- Runs in a single transaction that is rolled back, so it never mutates real data. Any failed
-- expectation raises and (with ON_ERROR_STOP=1) exits non-zero.

begin;

-- ---------------------------------------------------------------------------
-- Personas
--   O  owner: creates the tour
--   A  attacker: another authenticated user who tries to attach to O's tour
-- ---------------------------------------------------------------------------
\set O   '00000000-0000-0000-0000-0000000000d1'
\set A   '00000000-0000-0000-0000-0000000000d2'
\set ACT '00000000-0000-0000-0000-0000000000e1'
\set T   '00000000-0000-0000-0000-0000000000f1'

-- Seed as superuser (RLS bypassed). Inserting into auth.users fires handle_new_user(),
-- which creates the matching public.profiles row.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', :'O', 'authenticated', 'authenticated', 'ctwm-owner@test.local',    '{"display_name":"Owner"}',    now(), now()),
  ('00000000-0000-0000-0000-000000000000', :'A', 'authenticated', 'authenticated', 'ctwm-attacker@test.local', '{"display_name":"Attacker"}', now(), now());

insert into acts (id, name, created_by) values (:'ACT', 'CTWM Test Act', :'O');

-- Helper: run a SELECT and assert its scalar result. Mirrors membership_not_access.sql.
create function pg_temp.expect_count(q text, expected bigint, msg text)
returns void language plpgsql as $$
declare n bigint;
begin
  execute q into n;
  if n is distinct from expected then
    raise exception 'FAIL: % (expected %, got %) [%]', msg, expected, n, q;
  end if;
end $$;

-- =========================================================================
-- 1. Owner creates a brand-new tour -> exactly one tour + one membership.
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

select public.create_tour_with_membership(
  :'T'::uuid, :'ACT'::uuid, 'CTWM Test Act', 'My Tour', null, null, 'private'::visibility, 'FOH');

reset role;
select set_config('request.jwt.claims', '', true);

select pg_temp.expect_count(format('select count(*) from tours where id = %L', :'T'), 1,
  'create makes exactly one tour');
select pg_temp.expect_count(format('select count(*) from tour_members where tour_id = %L', :'T'), 1,
  'create makes exactly one membership');
select pg_temp.expect_count(format('select count(*) from tour_members where tour_id = %L and user_id = %L', :'T', :'O'), 1,
  'the sole member is the creator');

-- =========================================================================
-- 2. Owner replays the identical create -> idempotent (no duplicates).
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

select public.create_tour_with_membership(
  :'T'::uuid, :'ACT'::uuid, 'CTWM Test Act', 'My Tour', null, null, 'private'::visibility, 'FOH');

reset role;
select set_config('request.jwt.claims', '', true);

select pg_temp.expect_count(format('select count(*) from tours where id = %L', :'T'), 1,
  'replay keeps exactly one tour');
select pg_temp.expect_count(format('select count(*) from tour_members where tour_id = %L', :'T'), 1,
  'replay keeps exactly one membership');

-- =========================================================================
-- 3. Attacker tries to attach to the existing tour -> rejected, NO access.
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';

-- The call must raise (insufficient_privilege). Catch it in a subtransaction so the harness
-- can assert on the raise and then continue.
do $$
declare raised boolean := false;
begin
  begin
    perform public.create_tour_with_membership(
      '00000000-0000-0000-0000-0000000000f1'::uuid,  -- existing tour T
      '00000000-0000-0000-0000-0000000000e1'::uuid,
      'CTWM Test Act', 'Hijack', null, null, 'private'::visibility, 'crew');
  exception when others then
    raised := true;
  end;
  if not raised then
    raise exception 'FAIL: attaching membership to an existing tour must be rejected';
  end if;
end $$;

-- Still acting as the attacker: they gained no view access to the tour.
select pg_temp.expect_count(
  format('select (case when public.can_view_tour(%L) then 1 else 0 end)', :'T'), 0,
  'attacker gains no view access to a tour they did not create');

reset role;
select set_config('request.jwt.claims', '', true);

-- Ground truth (RLS bypassed): the attacker is not a member and the roster is unchanged.
select pg_temp.expect_count(format('select count(*) from tour_members where tour_id = %L and user_id = %L', :'T', :'A'), 0,
  'attacker received no membership row');
select pg_temp.expect_count(format('select count(*) from tour_members where tour_id = %L', :'T'), 1,
  'roster unchanged after the rejected attach');

\echo '================================================'
\echo 'create_tour_with_membership: ALL CHECKS PASSED'
\echo '================================================'

rollback;
