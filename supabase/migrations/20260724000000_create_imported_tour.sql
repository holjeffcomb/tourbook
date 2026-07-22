-- Transactional import pipeline (Stage 2.5 — docs/design/offline-write-support.md §4.8;
-- checklist §4.5). Closes review finding F1: AI import was the last multi-row write that did NOT
-- use the atomic-RPC contract every other multi-row write now follows
-- (create_tour_with_membership / update_tour_with_role).
--
-- Import writes a tour + the creator's membership + N shows. The old client did this as
-- createTour() then a per-stop loop of createShow() — a mid-loop failure left a tour with a
-- PARTIAL itinerary, per-stop inserts used no client id (a retry duplicated rows), and the whole
-- action was lost on a cold start. This function commits all of it in a SINGLE transaction, so it
-- is all-or-nothing, and it is idempotent on the client-supplied tour id AND client-supplied show
-- ids (`on conflict (id) do nothing`), so a flaky-network retry converges to exactly one tour with
-- N shows and no duplicates.
--
-- MODEL: "online to prepare, atomic to commit." Parsing (the parse-tour edge function) and
-- venue/geocode resolution can't run offline, so they stay CLIENT-SIDE during the review step.
-- By the time this RPC is called, every stop already carries a resolved venue_id OR inline
-- city/coords/country — so this function performs PURE INSERTS and contains no geocoding or venue
-- dedup logic (that lives once, in the client getOrCreateVenue / resolveShowLocation path).
--
-- SECURITY: mirrors the create_tour_with_membership ownership guard. Because the function is
-- SECURITY DEFINER (RLS is bypassed inside it) and p_tour_id is client-supplied, membership is
-- granted ONLY for a tour this call actually creates: if the id already exists, only its creator
-- may proceed (an idempotent replay of their own import); any other caller is rejected (42501) and
-- gains no membership and no access.

create or replace function public.create_imported_tour(
  p_tour_id uuid,
  p_act_id uuid,
  p_act_name text,
  p_title text,
  p_start_date date,
  p_end_date date,
  p_visibility visibility,
  p_role text,
  p_stops jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_act_id uuid := p_act_id;
begin
  if v_uid is null then
    raise exception 'must be authenticated';
  end if;

  -- Ownership guard first, before any side effects (act creation): only the creator may (re)use an
  -- existing tour id. A non-owner passing an existing id is attaching to a tour they didn't create
  -- — reject and grant nothing. A row whose creator is null (creator profile deleted) is not
  -- "owned" by the caller, so it fails closed here too.
  if exists (select 1 from tours where id = p_tour_id) then
    if not exists (select 1 from tours t where t.id = p_tour_id and t.created_by = v_uid) then
      raise exception 'cannot create tour %: id already exists', p_tour_id
        using errcode = '42501'; -- insufficient_privilege
    end if;
  else
    if v_act_id is null then
      v_act_id := public.get_or_create_act(p_act_name);
    end if;

    -- `on conflict (id) do nothing` guards the narrow race where a concurrent call inserted the
    -- same id between the existence check above and here.
    insert into tours (id, act_id, created_by, title, start_date, end_date, visibility)
      values (
        p_tour_id,
        v_act_id,
        v_uid,
        nullif(btrim(p_title), ''),
        p_start_date,
        p_end_date,
        coalesce(p_visibility, 'private')
      )
      on conflict (id) do nothing;

    -- If the insert lost the race, re-apply the ownership guard so we never attach to a tour
    -- created by someone else in the meantime.
    if not found then
      if not exists (select 1 from tours t where t.id = p_tour_id and t.created_by = v_uid) then
        raise exception 'cannot create tour %: id already exists', p_tour_id
          using errcode = '42501';
      end if;
    end if;
  end if;

  -- Creator's membership (idempotent). Runs for both a brand-new tour and an owner replaying.
  insert into tour_members (tour_id, user_id, role)
    values (p_tour_id, v_uid, nullif(btrim(p_role), ''))
    on conflict (tour_id, user_id) do nothing;

  -- All shows, in one shot, idempotent on the client-supplied ids. Every field is pre-resolved by
  -- the client (venue_id for booked venues, or inline city/coords/country) — no geocoding here.
  insert into shows (id, tour_id, created_by, date, kind, venue_id, city, country, latitude, longitude, address)
  select
    s.id,
    p_tour_id,
    v_uid,
    s.date,
    coalesce(nullif(s.kind, ''), 'show')::stop_kind,
    s.venue_id,
    s.city,
    s.country,
    s.latitude,
    s.longitude,
    s.address
  from jsonb_to_recordset(coalesce(p_stops, '[]'::jsonb)) as s(
    id uuid,
    date date,
    kind text,
    venue_id uuid,
    city text,
    country text,
    latitude double precision,
    longitude double precision,
    address text
  )
  on conflict (id) do nothing;

  return p_tour_id;
end;
$$;

grant execute on function public.create_imported_tour(uuid, uuid, text, text, date, date, visibility, text, jsonb) to authenticated;
