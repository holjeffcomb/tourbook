-- Privacy RLS harness for the Stage 1 social model
-- (docs/design/social-model.md §1.5/§5.2, docs/design/stage1-implementation-checklist.md §2).
--
-- Locks in "membership ≠ access": a tour member gets the shared skeleton (tour row + schedule)
-- but never the roster, and never another user's other tours; connections see connection-
-- visibility tours; strangers see nothing personal; the catalog RPC exposes tour existence to
-- everyone while gating the creator's identity to viewers who can already see the tour.
--
-- Run against a local Supabase DB:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/membership_not_access.sql
--
-- Everything runs inside a single transaction that is rolled back at the end, so it never
-- mutates real data. Any failed expectation raises and (with ON_ERROR_STOP=1) exits non-zero.

begin;

-- ---------------------------------------------------------------------------
-- Personas
--   O  owner/creator of both test tours
--   C  connection of O (accepted friendship), NOT a tour member
--   M  member of T1 with O, but NOT connected to anyone
--   S  stranger: no membership, no connection
-- ---------------------------------------------------------------------------
\set O '00000000-0000-0000-0000-0000000000a1'
\set C '00000000-0000-0000-0000-0000000000a2'
\set M '00000000-0000-0000-0000-0000000000a3'
\set S '00000000-0000-0000-0000-0000000000a4'
\set A  '00000000-0000-0000-0000-0000000000b1'
\set T1 '00000000-0000-0000-0000-0000000000c1'
\set T2 '00000000-0000-0000-0000-0000000000c2'

-- Seed as superuser (RLS bypassed). Inserting into auth.users fires handle_new_user(),
-- which creates the matching public.profiles row (display_name from user metadata).
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', :'O', 'authenticated', 'authenticated', 'owner@test.local',      '{"display_name":"Owner"}',      now(), now()),
  ('00000000-0000-0000-0000-000000000000', :'C', 'authenticated', 'authenticated', 'connection@test.local', '{"display_name":"Connection"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', :'M', 'authenticated', 'authenticated', 'member@test.local',     '{"display_name":"Member"}',     now(), now()),
  ('00000000-0000-0000-0000-000000000000', :'S', 'authenticated', 'authenticated', 'stranger@test.local',   '{"display_name":"Stranger"}',   now(), now());

insert into acts (id, name, created_by) values (:'A', 'RLS Test Act', :'O');

-- Accepted friendship O <-> C only.
insert into friendships (requester_id, addressee_id, status)
values (:'O', :'C', 'accepted');

-- T1: Connections-visible ('friends'), members {O, M}. T2: Private, members {O}.
insert into tours (id, act_id, created_by, title, visibility)
values
  (:'T1', :'A', :'O', 'Connections Tour', 'friends'),
  (:'T2', :'A', :'O', 'Private Tour',     'private');

insert into tour_members (tour_id, user_id, role) values
  (:'T1', :'O', 'FOH'),
  (:'T1', :'M', 'Lighting'),
  (:'T2', :'O', 'FOH');

-- A stop (off day) on T1 so we can check schedule (shows) visibility.
insert into shows (tour_id, created_by, date, kind, label)
values (:'T1', :'O', current_date, 'off', 'Travel day');

-- Helper: run a SELECT under the current (RLS-applied) role and assert its count.
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
-- STRANGER (S): sees no personal data; catalog shows existence but no identity.
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';

select pg_temp.expect_count(format('select count(*) from tours where id = %L', :'T1'), 0, 'stranger must not see connections tour');
select pg_temp.expect_count(format('select count(*) from tours where id = %L', :'T2'), 0, 'stranger must not see private tour');
select pg_temp.expect_count(format('select count(*) from shows where tour_id = %L', :'T1'), 0, 'stranger must not see tour schedule');
select pg_temp.expect_count(format('select count(*) from tour_members where tour_id in (%L, %L)', :'T1', :'T2'), 0, 'stranger must not enumerate any roster');
select pg_temp.expect_count(format('select count(*) from search_tours_by_act(%L)', :'A'), 2, 'catalog exposes both tours'' existence to everyone');
select pg_temp.expect_count(format('select count(*) from search_tours_by_act(%L) where creator_display_name is not null', :'A'), 0, 'catalog hides creator identity from a stranger');

reset role;
select set_config('request.jwt.claims', '', true);

-- =========================================================================
-- NON-CONNECTED CO-MEMBER (M): shared skeleton of T1 only; no roster; no other tours.
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';

select pg_temp.expect_count(format('select count(*) from tours where id = %L', :'T1'), 1, 'co-member sees the tour skeleton');
select pg_temp.expect_count(format('select count(*) from shows where tour_id = %L', :'T1'), 1, 'co-member sees the shared schedule');
select pg_temp.expect_count(format('select count(*) from tours where id = %L', :'T2'), 0, 'membership must not leak the owner''s other (private) tour');
select pg_temp.expect_count(format('select count(*) from tour_members where tour_id = %L and user_id = %L', :'T1', :'M'), 1, 'co-member sees their own membership');
select pg_temp.expect_count(format('select count(*) from tour_members where tour_id = %L and user_id = %L', :'T1', :'O'), 0, 'co-member must NOT enumerate other members (no crew directory)');

reset role;
select set_config('request.jwt.claims', '', true);

-- =========================================================================
-- CONNECTION (C): sees connections-visible tour + owner's roster row; not private tour; not non-connections.
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select pg_temp.expect_count(format('select count(*) from tours where id = %L', :'T1'), 1, 'connection sees a connections-visibility tour');
select pg_temp.expect_count(format('select count(*) from tours where id = %L', :'T2'), 0, 'connection must NOT see a private tour they are not on');
select pg_temp.expect_count(format('select count(*) from tour_members where tour_id = %L and user_id = %L', :'T1', :'O'), 1, 'connection sees their connection''s membership row');
select pg_temp.expect_count(format('select count(*) from tour_members where tour_id = %L and user_id = %L', :'T1', :'M'), 0, 'connection must NOT see a non-connection member');
select pg_temp.expect_count(format('select count(*) from search_tours_by_act(%L) where creator_display_name is not null', :'A'), 1, 'catalog shows creator only for the tour the connection can view (T1)');

reset role;
select set_config('request.jwt.claims', '', true);

-- =========================================================================
-- OWNER (O): full visibility, full roster, catalog identity for own tours.
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select pg_temp.expect_count(format('select count(*) from tours where id in (%L, %L)', :'T1', :'T2'), 2, 'owner sees both their tours');
select pg_temp.expect_count(format('select count(*) from tour_members where tour_id = %L', :'T1'), 2, 'owner sees the full roster of their tour');
select pg_temp.expect_count(format('select count(*) from search_tours_by_act(%L) where creator_display_name is not null', :'A'), 2, 'catalog shows creator for both of the owner''s tours');

reset role;
select set_config('request.jwt.claims', '', true);

\echo '======================================='
\echo 'membership_not_access: ALL CHECKS PASSED'
\echo '======================================='

rollback;
