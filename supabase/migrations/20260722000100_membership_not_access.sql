-- Membership ≠ access (Stage 1 of the approved social model —
-- docs/design/social-model.md §1.5/§5.2, docs/design/stage1-implementation-checklist.md §2).
--
-- Enforces the core principle at the data layer: being a member of a tour is professional
-- context, NOT a permission grant. Concretely this migration:
--   1. Removes the retired `visibility = 'public'` branch from tour/show read policies.
--   2. Keeps the shared-skeleton grant for members (a member may read the tour row + its
--      schedule) but routes it through SECURITY DEFINER helpers.
--   3. Replaces the world-readable `tour_members` SELECT (`using (true)`) with a
--      privacy-preserving roster policy: you can only see your own membership, a member
--      who is your Connection, or — if you own the tour — the full roster. No co-member
--      enumeration, no public crew directory.
--
-- Why SECURITY DEFINER helpers: the `tours` SELECT policy references `tour_members` (member
-- branch) and the new `tour_members` SELECT policy references `tours` (owner branch). Inline
-- cross-table subqueries in both policies would make each table's RLS re-trigger the other's,
-- which Postgres rejects as "infinite recursion detected in policy". The helpers run as their
-- owner (RLS does not apply inside a definer function), breaking the cycle. They take no user
-- argument and use auth.uid() internally, so they can't be used to probe another user's access.
-- This mirrors the existing public.is_friends(...) helper.

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

-- True when the current user may see the shared skeleton of a tour: they created it,
-- it's shared with Connections and they're a Connection of the creator, or they're a member.
create or replace function public.can_view_tour(p_tour_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from tours t
    where t.id = p_tour_id
      and (
        t.created_by = auth.uid()
        or (
          t.visibility = 'friends'
          and t.created_by is not null
          and public.is_friends(t.created_by, auth.uid())
        )
        or exists (
          select 1 from tour_members m
          where m.tour_id = t.id and m.user_id = auth.uid()
        )
      )
  );
$$;

grant execute on function public.can_view_tour(uuid) to authenticated;

-- True when the current user is the creator (owner) of the tour. Used so the owner — and
-- only the owner — can enumerate the full roster.
create or replace function public.owns_tour(p_tour_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from tours t
    where t.id = p_tour_id and t.created_by = auth.uid()
  );
$$;

grant execute on function public.owns_tour(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- tours SELECT: owner / Connection (Connections visibility) / member.
-- Drops the retired 'public' branch.
-- ---------------------------------------------------------------------------
drop policy "Tours are viewable by public, friends, or members" on tours;

create policy "Tours are viewable by owner, connections, or members"
  on tours for select to authenticated
  using (public.can_view_tour(id));

-- ---------------------------------------------------------------------------
-- shows SELECT: mirrors the parent tour's skeleton visibility (owner/Connection/member).
-- Drops the retired 'public' branch.
-- ---------------------------------------------------------------------------
drop policy "Shows are viewable when their tour is" on shows;

create policy "Shows are viewable when their tour is"
  on shows for select to authenticated
  using (public.can_view_tour(tour_id));

-- ---------------------------------------------------------------------------
-- tour_members SELECT: privacy-preserving roster (replaces `using (true)`).
--   * your own membership rows
--   * a member who is your Connection ("which of my connections are here")
--   * the full roster, but only for a tour you own
-- No co-member enumeration; no public crew directory.
-- ---------------------------------------------------------------------------
drop policy "Tour members are viewable by authenticated users" on tour_members;

create policy "Tour roster is viewable by owner, self, or connections"
  on tour_members for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_friends(user_id, auth.uid())
    or public.owns_tour(tour_id)
  );
