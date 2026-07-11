-- Initial schema for the touring logbook.
--
-- Two categories of data:
--   * Personal log data (profiles, tours, shows) — owned by a user, private in v1.
--   * Shared reference data (acts, venues) — community-wide, deduped by normalized name.
--
-- Visibility is modeled as a first-class enum (seeded with only 'private') so that
-- adding 'friends'/'public' later is additive, not a schema rewrite.

-- Extend this enum later (e.g. 'friends', 'public') to enable social sharing.
create type visibility as enum ('private');

-- Keeps updated_at accurate on any row update.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, created automatically on signup.
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create policy "Profiles are viewable by owner"
  on profiles for select to authenticated
  using (auth.uid() = id);

create policy "Profiles are insertable by owner"
  on profiles for insert to authenticated
  with check (auth.uid() = id);

create policy "Profiles are updatable by owner"
  on profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Create the profile row when a new auth user signs up. display_name is taken
-- from signup metadata when provided, otherwise left null for later onboarding.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- acts: shared reference data. Any authenticated user may look up or create an
-- act; deduped by a normalized name. Not editable/deletable from the client in
-- v1 (moderation comes later).
-- ---------------------------------------------------------------------------
create table acts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text generated always as (lower(btrim(name))) stored,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index acts_normalized_name_key on acts (normalized_name);

alter table acts enable row level security;

create policy "Acts are viewable by authenticated users"
  on acts for select to authenticated
  using (true);

create policy "Acts are insertable by authenticated users"
  on acts for insert to authenticated
  with check (auth.uid() = created_by);

-- ---------------------------------------------------------------------------
-- venues: shared reference data, deduped by normalized (name, city).
-- ---------------------------------------------------------------------------
create table venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  normalized_name text generated always as (lower(btrim(name))) stored,
  normalized_city text generated always as (lower(btrim(city))) stored,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index venues_normalized_key on venues (normalized_name, normalized_city);

alter table venues enable row level security;

create policy "Venues are viewable by authenticated users"
  on venues for select to authenticated
  using (true);

create policy "Venues are insertable by authenticated users"
  on venues for insert to authenticated
  with check (auth.uid() = created_by);

-- ---------------------------------------------------------------------------
-- tours: personal log data. A tour belongs to a user and references a shared
-- act. role is recorded per tour. A one-off gig is a tour with a single show.
-- ---------------------------------------------------------------------------
create table tours (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  act_id uuid not null references acts (id) on delete restrict,
  role text,
  title text,
  start_date date,
  end_date date,
  visibility visibility not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tours_date_range_check
    check (start_date is null or end_date is null or end_date >= start_date)
);

create index tours_user_id_idx on tours (user_id);
create index tours_act_id_idx on tours (act_id);

alter table tours enable row level security;

create trigger tours_set_updated_at
  before update on tours
  for each row execute function set_updated_at();

create policy "Tours are viewable by owner"
  on tours for select to authenticated
  using (auth.uid() = user_id);

create policy "Tours are insertable by owner"
  on tours for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Tours are updatable by owner"
  on tours for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Tours are deletable by owner"
  on tours for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- shows: personal log data. Belongs to a tour and references a shared venue.
-- user_id is denormalized from the parent tour for simpler/faster RLS; the
-- insert/update policies verify the referenced tour is owned by the same user
-- so a show can never be attached to someone else's tour.
-- ---------------------------------------------------------------------------
create table shows (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  venue_id uuid not null references venues (id) on delete restrict,
  date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shows_tour_id_idx on shows (tour_id);
create index shows_user_id_idx on shows (user_id);
create index shows_venue_id_idx on shows (venue_id);

alter table shows enable row level security;

create trigger shows_set_updated_at
  before update on shows
  for each row execute function set_updated_at();

create policy "Shows are viewable by owner"
  on shows for select to authenticated
  using (auth.uid() = user_id);

create policy "Shows are insertable by owner"
  on shows for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from tours t where t.id = tour_id and t.user_id = auth.uid())
  );

create policy "Shows are updatable by owner"
  on shows for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from tours t where t.id = tour_id and t.user_id = auth.uid())
  );

create policy "Shows are deletable by owner"
  on shows for delete to authenticated
  using (auth.uid() = user_id);
