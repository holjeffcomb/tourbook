-- Catalog linkage (Stage 1 of the approved social model —
-- docs/design/social-model.md §catalog-linkage, docs/design/stage1-implementation-checklist.md §3).
--
-- After membership-not-access tightened tour RLS, the "existing tours for an act" discovery
-- that powers join-not-duplicate (src/features/tours/AddTourScreen.tsx) and the act page's
-- Tours list (ActDetailScreen) can no longer see tours the viewer isn't already on/connected
-- to — which would silently reintroduce duplicate tours for shared acts.
--
-- The model treats a tour's *existence + basic metadata* (act, title, date range, member
-- count) as non-sensitive catalog data, while the *roster and itinerary* stay private. This
-- SECURITY DEFINER function exposes exactly that catalog slice for an act, decoupled from
-- visibility, WITHOUT enumerating members: the only person-identifying field, the creator's
-- display name, is returned only when the caller can already view the tour (own / Connection /
-- member) — otherwise null. This keeps join-not-duplicate working without building a crew
-- directory or leaking who is on a private tour.

create or replace function public.search_tours_by_act(p_act_id uuid)
returns table (
  id uuid,
  title text,
  start_date date,
  end_date date,
  created_at timestamptz,
  act_id uuid,
  act_name text,
  member_count integer,
  creator_display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.title,
    t.start_date,
    t.end_date,
    t.created_at,
    a.id as act_id,
    a.name as act_name,
    (select count(*)::integer from tour_members m where m.tour_id = t.id) as member_count,
    -- Identity is gated: only surfaced for tours the caller may already see.
    case when public.can_view_tour(t.id) then p.display_name end as creator_display_name
  from tours t
  join acts a on a.id = t.act_id
  left join profiles p on p.id = t.created_by
  where t.act_id = p_act_id
  order by t.created_at desc;
$$;

grant execute on function public.search_tours_by_act(uuid) to authenticated;
