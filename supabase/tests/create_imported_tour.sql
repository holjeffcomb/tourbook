-- Regression harness for the transactional import pipeline (Stage 2.5 —
-- docs/design/offline-write-support.md §4.8; migration
-- supabase/migrations/20260724000000_create_imported_tour.sql).
--
-- Proves the SECURITY DEFINER import RPC commits the whole import atomically and only ever grants
-- membership for a tour THIS call creates:
--   1. Creating a new imported tour makes exactly one tour, one membership (creator), and every
--      show in one shot — booked venues keep their venue_id, city-only stops keep inline location.
--   2. Replaying the identical import is idempotent (no duplicate tour / membership / shows).
--   3. Attaching to an existing tour you don't own is rejected and grants NO access and adds NO shows.
--
-- Run against a local Supabase DB:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/create_imported_tour.sql
--
-- Runs in a single transaction that is rolled back, so it never mutates real data. Any failed
-- expectation raises and (with ON_ERROR_STOP=1) exits non-zero.

begin;

-- ---------------------------------------------------------------------------
-- Personas / fixtures
--   O   owner: runs the import
--   A   attacker: another authenticated user who tries to attach to O's tour
--   V   a pre-existing (booked) catalog venue reused by one stop
--   S1  booked-venue show (references V)   S2  city-only show (inline location)
-- ---------------------------------------------------------------------------
\set O   '00000000-0000-0000-0000-0000000000c1'
\set A   '00000000-0000-0000-0000-0000000000c2'
\set ACT '00000000-0000-0000-0000-0000000000d1'
\set V   '00000000-0000-0000-0000-0000000000d2'
\set T   '00000000-0000-0000-0000-0000000000e1'
\set S1  '00000000-0000-0000-0000-0000000000e2'
\set S2  '00000000-0000-0000-0000-0000000000e3'

-- Seed as superuser (RLS bypassed). Inserting into auth.users fires handle_new_user(),
-- which creates the matching public.profiles row.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', :'O', 'authenticated', 'authenticated', 'cit-owner@test.local',    '{"display_name":"Owner"}',    now(), now()),
  ('00000000-0000-0000-0000-000000000000', :'A', 'authenticated', 'authenticated', 'cit-attacker@test.local', '{"display_name":"Attacker"}', now(), now());

insert into acts (id, name, created_by) values (:'ACT', 'CIT Test Act', :'O');
insert into venues (id, name, city, created_by) values (:'V', 'CIT Fillmore', 'San Francisco', :'O');

-- Helper: run a SELECT and assert its scalar result. Mirrors create_tour_with_membership.sql.
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
-- 1. Owner imports a brand-new tour -> one tour + one membership + two shows.
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

select public.create_imported_tour(
  :'T'::uuid, :'ACT'::uuid, 'CIT Test Act', 'Imported Tour',
  '2024-06-01'::date, '2024-06-02'::date, 'private'::visibility, 'FOH',
  jsonb_build_array(
    jsonb_build_object(
      'id', :'S1', 'date', '2024-06-01', 'kind', 'show', 'venue_id', :'V',
      'city', null, 'country', null, 'latitude', null, 'longitude', null, 'address', null),
    jsonb_build_object(
      'id', :'S2', 'date', '2024-06-02', 'kind', 'show', 'venue_id', null,
      'city', 'Reno', 'country', 'United States', 'latitude', 39.5, 'longitude', -119.8, 'address', null)
  )
);

reset role;
select set_config('request.jwt.claims', '', true);

select pg_temp.expect_count(format('select count(*) from tours where id = %L', :'T'), 1,
  'import makes exactly one tour');
select pg_temp.expect_count(format('select count(*) from tour_members where tour_id = %L and user_id = %L', :'T', :'O'), 1,
  'import makes exactly one membership (the creator)');
select pg_temp.expect_count(format('select count(*) from shows where tour_id = %L', :'T'), 2,
  'import commits both shows atomically');
select pg_temp.expect_count(format('select count(*) from shows where tour_id = %L and created_by = %L', :'T', :'O'), 2,
  'both shows are attributed to the creator');

-- Booked-venue stop keeps its venue_id; city-only stop keeps inline location.
select pg_temp.expect_count(format('select count(*) from shows where id = %L and venue_id = %L', :'S1', :'V'), 1,
  'booked-venue stop stores its venue_id');
select pg_temp.expect_count(
  format('select count(*) from shows where id = %L and venue_id is null and city = %L and latitude = 39.5', :'S2', 'Reno'), 1,
  'city-only stop stores inline city/coords with no venue');

-- =========================================================================
-- 2. Owner replays the identical import -> idempotent (no duplicates).
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

select public.create_imported_tour(
  :'T'::uuid, :'ACT'::uuid, 'CIT Test Act', 'Imported Tour',
  '2024-06-01'::date, '2024-06-02'::date, 'private'::visibility, 'FOH',
  jsonb_build_array(
    jsonb_build_object(
      'id', :'S1', 'date', '2024-06-01', 'kind', 'show', 'venue_id', :'V',
      'city', null, 'country', null, 'latitude', null, 'longitude', null, 'address', null),
    jsonb_build_object(
      'id', :'S2', 'date', '2024-06-02', 'kind', 'show', 'venue_id', null,
      'city', 'Reno', 'country', 'United States', 'latitude', 39.5, 'longitude', -119.8, 'address', null)
  )
);

reset role;
select set_config('request.jwt.claims', '', true);

select pg_temp.expect_count(format('select count(*) from tours where id = %L', :'T'), 1,
  'replay keeps exactly one tour');
select pg_temp.expect_count(format('select count(*) from tour_members where tour_id = %L', :'T'), 1,
  'replay keeps exactly one membership');
select pg_temp.expect_count(format('select count(*) from shows where tour_id = %L', :'T'), 2,
  'replay keeps exactly two shows (idempotent on show ids)');

-- =========================================================================
-- 3. Attacker imports onto the existing tour id -> rejected, NO access/shows.
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';

-- The call must raise (insufficient_privilege). Catch it in a subtransaction so the harness
-- can assert on the raise and then continue.
do $$
declare raised boolean := false;
begin
  begin
    perform public.create_imported_tour(
      '00000000-0000-0000-0000-0000000000e1'::uuid,  -- existing tour T
      '00000000-0000-0000-0000-0000000000d1'::uuid,
      'CIT Test Act', 'Hijack', '2024-06-01'::date, '2024-06-03'::date, 'private'::visibility, 'crew',
      jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-0000-0000-0000000000ff', 'date', '2024-06-03', 'kind', 'show',
          'venue_id', null, 'city', 'Hijack City', 'country', null,
          'latitude', null, 'longitude', null, 'address', null)));
  exception when others then
    raised := true;
  end;
  if not raised then
    raise exception 'FAIL: importing onto an existing tour you do not own must be rejected';
  end if;
end $$;

-- Still acting as the attacker: they gained no view access to the tour.
select pg_temp.expect_count(
  format('select (case when public.can_view_tour(%L) then 1 else 0 end)', :'T'), 0,
  'attacker gains no view access to a tour they did not create');

reset role;
select set_config('request.jwt.claims', '', true);

-- Ground truth (RLS bypassed): no membership granted, roster + shows unchanged.
select pg_temp.expect_count(format('select count(*) from tour_members where tour_id = %L and user_id = %L', :'T', :'A'), 0,
  'attacker received no membership row');
select pg_temp.expect_count(format('select count(*) from tour_members where tour_id = %L', :'T'), 1,
  'roster unchanged after the rejected import');
select pg_temp.expect_count(format('select count(*) from shows where tour_id = %L', :'T'), 2,
  'no attacker shows were committed (atomic rollback)');

\echo '================================================'
\echo 'create_imported_tour: ALL CHECKS PASSED'
\echo '================================================'

rollback;
