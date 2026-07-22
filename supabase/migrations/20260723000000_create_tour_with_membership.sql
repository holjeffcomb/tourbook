-- Atomic tour create/update RPCs (offline write support — docs/design/offline-write-support.md
-- §"Multi-row writes must be atomic").
--
-- Creating a tour writes two related rows (tours + the creator's tour_members row) and may also
-- need to resolve/create the act. Done as separate client calls, a failure between them — very
-- possible when an offline mutation is replayed on reconnect — leaves a PARTIAL record (a tour
-- with no membership, or vice versa). A function runs in a single transaction, so the whole
-- action commits or rolls back together. Both RPCs are idempotent on the client-generated tour id
-- so replaying a queued mutation any number of times converges to one tour.

-- Resolve an act by its (deduped) normalized name, creating it if absent. SECURITY DEFINER so it
-- can run inside the tour RPCs regardless of the acts RLS insert policy; still attributes creation
-- to the caller. Mirrors the client getOrCreateAct dedup (acts_normalized_name_key).
create or replace function public.get_or_create_act(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_norm text := lower(btrim(p_name));
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'must be authenticated';
  end if;
  if v_norm = '' then
    raise exception 'act name is required';
  end if;

  insert into acts (name, created_by)
    values (btrim(p_name), v_uid)
    on conflict (normalized_name) do nothing;

  select id into v_id from acts where normalized_name = v_norm;
  return v_id;
end;
$$;

grant execute on function public.get_or_create_act(text) to authenticated;

-- Create a tour + the creator's membership atomically and idempotently. p_tour_id is the
-- client-generated id (the tours PK); p_act_id is used directly when the caller picked an existing
-- act, otherwise the act is resolved/created from p_act_name.
--
-- SECURITY: membership is granted ONLY for a tour this call actually creates. Because the function
-- is SECURITY DEFINER (RLS is bypassed inside it) and p_tour_id is client-supplied, an earlier
-- version that unconditionally inserted the membership let any authenticated caller attach
-- themselves to an *existing* tour they don't own (by passing its id) — and, via can_view_tour's
-- member branch, read it. We now short-circuit when the id already exists: the original creator
-- replaying their own queued create is an idempotent no-op; anyone else is rejected and gets NO
-- membership. This is the single guard for this vulnerability; broader join/visibility policy is
-- unchanged.
create or replace function public.create_tour_with_membership(
  p_tour_id uuid,
  p_act_id uuid,
  p_act_name text,
  p_title text,
  p_start_date date,
  p_end_date date,
  p_visibility visibility,
  p_role text
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

  -- Guard first, before any side effects (act creation): if a tour with this id already exists,
  -- only its creator may proceed (idempotent replay of their own create). Any other caller is
  -- attempting to attach to a tour they did not create — reject and grant NO membership. A row
  -- whose creator is null (creator profile deleted) is also not "owned" by the caller, so it
  -- fails closed here too.
  if exists (select 1 from tours where id = p_tour_id) then
    if not exists (select 1 from tours t where t.id = p_tour_id and t.created_by = v_uid) then
      raise exception 'cannot create tour %: id already exists', p_tour_id
        using errcode = '42501'; -- insufficient_privilege
    end if;
    -- Owner replaying their own create: ensure their membership exists, then no-op.
    insert into tour_members (tour_id, user_id, role)
      values (p_tour_id, v_uid, nullif(btrim(p_role), ''))
      on conflict (tour_id, user_id) do nothing;
    return p_tour_id;
  end if;

  if v_act_id is null then
    v_act_id := public.get_or_create_act(p_act_name);
  end if;

  -- New tour. `on conflict (id) do nothing` guards the narrow race where a concurrent call
  -- inserted the same id between the existence check above and here.
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

  -- If the insert didn't create the row (lost the race), re-apply the ownership guard so we never
  -- attach to a tour created by someone else in the meantime.
  if not found then
    if not exists (select 1 from tours t where t.id = p_tour_id and t.created_by = v_uid) then
      raise exception 'cannot create tour %: id already exists', p_tour_id
        using errcode = '42501';
    end if;
  end if;

  insert into tour_members (tour_id, user_id, role)
    values (p_tour_id, v_uid, nullif(btrim(p_role), ''))
    on conflict (tour_id, user_id) do nothing;

  return p_tour_id;
end;
$$;

grant execute on function public.create_tour_with_membership(uuid, uuid, text, text, date, date, visibility, text) to authenticated;

-- Update a tour's details and the caller's own role atomically. Only the tour creator may change
-- the tour itself (enforced here, since SECURITY DEFINER bypasses RLS); anyone may set their own
-- role. Resolving the act server-side keeps the whole action offline-replayable (no client network
-- call to getOrCreateAct).
create or replace function public.update_tour_with_role(
  p_tour_id uuid,
  p_act_name text,
  p_title text,
  p_start_date date,
  p_end_date date,
  p_visibility visibility,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_act_id uuid;
begin
  if v_uid is null then
    raise exception 'must be authenticated';
  end if;

  if not exists (select 1 from tours where id = p_tour_id and created_by = v_uid) then
    raise exception 'only the tour creator can update this tour';
  end if;

  v_act_id := public.get_or_create_act(p_act_name);

  update tours set
    act_id = v_act_id,
    title = nullif(btrim(p_title), ''),
    start_date = p_start_date,
    end_date = p_end_date,
    visibility = coalesce(p_visibility, visibility)
  where id = p_tour_id;

  update tour_members set role = nullif(btrim(p_role), '')
  where tour_id = p_tour_id and user_id = v_uid;
end;
$$;

grant execute on function public.update_tour_with_role(uuid, text, text, date, date, visibility, text) to authenticated;
