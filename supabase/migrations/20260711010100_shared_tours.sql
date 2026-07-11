-- Shift tours from private, per-user records into shared, discoverable entities
-- that users join.
--
--   * A tour is now a real-world entity (act + optional title/dates), created by
--     one user but readable by everyone (a shared catalog, like acts/venues).
--   * Participation and role move to tour_members — one row per user on a tour.
--   * Shows attach to the shared tour; any member can add shows, and each show is
--     editable only by whoever created it.
--
-- Verification/curation to prevent over-duplication comes later; for now the
-- add-tour flow surfaces existing tours so users join instead of duplicating.

-- ---------------------------------------------------------------------------
-- 1. tour_members: a user's participation in a shared tour.
-- ---------------------------------------------------------------------------
-- user_id references profiles (which itself references auth.users) so the member's
-- display name can be embedded directly in queries.
create table tour_members (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role text,
  created_at timestamptz not null default now(),
  unique (tour_id, user_id)
);

create index tour_members_tour_id_idx on tour_members (tour_id);
create index tour_members_user_id_idx on tour_members (user_id);

alter table tour_members enable row level security;

create policy "Tour members are viewable by authenticated users"
  on tour_members for select to authenticated
  using (true);

create policy "Users can join tours"
  on tour_members for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update their own membership"
  on tour_members for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can leave tours"
  on tour_members for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Add new ownership columns and backfill from the current data.
-- ---------------------------------------------------------------------------
-- created_by references profiles so the creator's display name can be embedded.
alter table tours add column created_by uuid references profiles (id) on delete set null;
alter table shows add column created_by uuid references profiles (id) on delete set null;

-- The existing owner becomes the creator and the first member; make all existing
-- tours public so they remain visible under the new model.
update tours set created_by = user_id;
update shows set created_by = user_id;

insert into tour_members (tour_id, user_id, role)
  select id, user_id, role from tours;

update tours set visibility = 'public';
alter table tours alter column visibility set default 'public';

-- ---------------------------------------------------------------------------
-- 3. Drop all owner-only policies before removing the columns they depend on.
--    (Shows' old insert/update policies reference tours.user_id.)
-- ---------------------------------------------------------------------------
drop policy "Tours are viewable by owner" on tours;
drop policy "Tours are insertable by owner" on tours;
drop policy "Tours are updatable by owner" on tours;
drop policy "Tours are deletable by owner" on tours;

drop policy "Shows are viewable by owner" on shows;
drop policy "Shows are insertable by owner" on shows;
drop policy "Shows are updatable by owner" on shows;
drop policy "Shows are deletable by owner" on shows;

alter table tours drop column role;
alter table tours drop column user_id;
alter table shows drop column user_id;

create index shows_created_by_idx on shows (created_by);

-- ---------------------------------------------------------------------------
-- 4. Shared-catalog policies.
-- ---------------------------------------------------------------------------
create policy "Public tours are viewable; private tours only by members"
  on tours for select to authenticated
  using (
    visibility = 'public'
    or exists (
      select 1 from tour_members m
      where m.tour_id = tours.id and m.user_id = auth.uid()
    )
  );

create policy "Authenticated users can create tours"
  on tours for insert to authenticated
  with check (created_by = auth.uid());

create policy "Tour creator can update the tour"
  on tours for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "Tour creator can delete the tour"
  on tours for delete to authenticated
  using (created_by = auth.uid());

create policy "Shows are viewable when their tour is"
  on shows for select to authenticated
  using (
    exists (
      select 1 from tours t
      where t.id = shows.tour_id
        and (
          t.visibility = 'public'
          or exists (
            select 1 from tour_members m
            where m.tour_id = t.id and m.user_id = auth.uid()
          )
        )
    )
  );

create policy "Members can add shows to their tours"
  on shows for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from tour_members m
      where m.tour_id = shows.tour_id and m.user_id = auth.uid()
    )
  );

create policy "Show creator can update their show"
  on shows for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "Show creator can delete their show"
  on shows for delete to authenticated
  using (created_by = auth.uid());
