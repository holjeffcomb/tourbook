# Design Proposal: Server-Side Crossing Paths

**Status:** 4A implemented — on-demand `crossed_paths` RPC (no PostGIS/cron/precompute).
4B (precompute + push notifications) remains a future follow-on.
**Phase:** 4 (Future Planning)
**Author:** Architecture review follow-up

> **Implemented (4A).** `supabase/migrations/20260721000000_crossed_paths_rpc.sql` adds a
> `SECURITY DEFINER` `crossed_paths(max_miles, date_window_days)` function that returns the
> matched stop pairs between the caller and their accepted friends, re-checking friendship +
> tour visibility internally. `useUpcomingCrossedPaths` now calls it via
> `listCrossedPaths()` instead of fanning out over every friend's itinerary; label/city/
> `same_venue|same_city|nearby` classification stays in `compute.ts` (shared `buildNearMiss`)
> so the badge, the 1:1 Compare screen, and the detail screen agree. Pure-SQL haversine
> (`asin` form) matches `src/lib/geo.ts`; no PostGIS. Deferred pieces below are unchanged.

---

## 1. Problem / Motivation

"Crossing paths" (a.k.a. near-misses) tells a user when their tour was — or will be —
near a friend's tour in both **space** (≤ N miles) and **time** (within a date window).
It's one of Tourbook's signature social features and a core reason to add friends.

Today the entire computation happens **on the device**. That's fine for a handful of
friends with short tours, but it will not scale to the roadmap's "tens of thousands of
users," and it structurally blocks push notifications ("A friend's tour is coming near
you next week").

## 2. Current State (as built)

Client-side pipeline in [`src/features/social/useUpcomingCrossedPaths.ts`](../../src/features/social/useUpcomingCrossedPaths.ts)
and [`src/features/stats/compute.ts`](../../src/features/stats/compute.ts):

1. `useFriends()` → list of accepted friends.
2. `useQueries` fetches **each friend's visible tours** (`listVisibleToursForUser`).
3. `useQueries` fetches **every stop of every tour** (mine + all friends'), via `listStops`.
4. `computeNearMisses(...)` runs a nested loop: for each of my located+dated stops × each
   friend stop, compute `haversineMiles` and a date delta; keep pairs under the thresholds.
5. `partitionNearMisses` splits upcoming vs past; results feed in-app badges/lists.

### Why this won't scale

- **Data transfer**: the device downloads the full itinerary (all stops, coordinates,
  dates) of every friend, every session. With F friends × T tours × S stops, payload and
  cache grow linearly with the whole friend graph's data.
- **Compute**: near-miss detection is `O(myStops × friendStops)` **per friend**, i.e.
  roughly `O(myStops × Σ friendStops)`. On a phone. Recomputed on every relevant query
  settle (`useMemo` deps include all stop queries).
- **No push**: because it only runs while the app is open and only over data already
  synced to the device, we can't proactively notify ("you'll be 30 miles apart on Aug 3").
- **Privacy coupling**: correctness depends entirely on RLS (`'friends'` visibility +
  `is_friends`) being right on every `listStops`/tour read. Any future read-path change
  risks leaking or hiding stops. Centralizing the join in one audited function is safer.

## 3. Goals & Non-Goals

**Goals**
- Move near-miss detection to the server so the device fetches *results*, not raw graphs.
- Enable push notifications for upcoming crossings.
- Preserve current thresholds/semantics (default 100 miles, same-day window, exclude
  same-tour co-membership, `same_venue` / `same_city` / `nearby` classification).
- Keep privacy guarantees identical (only surface crossings between the viewer and an
  **accepted friend**, and only on tours the viewer is allowed to see).

**Non-Goals**
- Changing the near-miss thresholds or UI.
- Real-time/live-location crossing (this is itinerary-based, not GPS presence).
- Follower-based crossings (see the Follow-vs-Friend proposal; keep to accepted friends
  for now).

## 4. Proposed Design

Two viable server strategies. **Recommendation: start with 4A (on-demand RPC)**, add
4B (precompute + notify) only when push is prioritized. 4A alone removes the scaling and
transfer problems; 4B builds on it for notifications.

### 4A. On-demand SQL RPC (`SECURITY DEFINER`)

A Postgres function computes near-misses for the calling user against one friend (or all
friends), entirely in the DB, and returns just the matched pairs.

```sql
-- Sketch — not final. Runs as definer so it can join across the friend's rows,
-- but MUST re-check friendship + visibility internally before returning anything.
create or replace function public.crossed_paths(
  max_miles double precision default 100,
  date_window_days int default 0,
  upcoming_only boolean default true
)
returns table (
  friend_id uuid,
  my_stop_id uuid, my_tour_id uuid, my_date date, my_lat double precision, my_lng double precision,
  their_stop_id uuid, their_tour_id uuid, their_date date, their_lat double precision, their_lng double precision,
  miles double precision,
  kind text  -- 'same_venue' | 'same_city' | 'nearby'
)
language sql stable security definer set search_path = public as $$
  with me as (
    select s.id, s.tour_id, s.date, s.latitude, s.longitude, s.venue_id, s.city
    from shows s
    join tour_members tm on tm.tour_id = s.tour_id and tm.user_id = auth.uid()
    where s.latitude is not null and s.date is not null
  ),
  friends as (
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as fid
    from friendships f
    where f.status = 'accepted' and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  ),
  theirs as (
    select fr.fid as friend_id, s.id, s.tour_id, s.date, s.latitude, s.longitude, s.venue_id, s.city
    from friends fr
    join tour_members tm on tm.user_id = fr.fid
    join shows s on s.tour_id = tm.tour_id
    join tours t on t.id = s.tour_id
    where s.latitude is not null and s.date is not null
      and (
        t.visibility = 'public'
        or (t.visibility = 'friends' and public.is_friends(t.created_by, auth.uid()))
        or exists (select 1 from tour_members m where m.tour_id = t.id and m.user_id = auth.uid())
      )
  )
  select
    theirs.friend_id,
    me.id, me.tour_id, me.date, me.latitude, me.longitude,
    theirs.id, theirs.tour_id, theirs.date, theirs.latitude, theirs.longitude,
    -- haversine in SQL (or ST_DistanceSphere with PostGIS, see below)
    3958.7613 * 2 * asin(sqrt(
      power(sin(radians(theirs.latitude - me.latitude)/2), 2) +
      cos(radians(me.latitude)) * cos(radians(theirs.latitude)) *
      power(sin(radians(theirs.longitude - me.longitude)/2), 2)
    )) as miles,
    case
      when me.venue_id is not null and me.venue_id = theirs.venue_id then 'same_venue'
      when lower(me.city) = lower(theirs.city) and me.city <> '' then 'same_city'
      else 'nearby'
    end as kind
  from me
  join theirs
    on me.tour_id <> theirs.tour_id
   and abs(me.date - theirs.date) <= date_window_days
  where (not upcoming_only or greatest(me.date, theirs.date) >= current_date)
    and /* miles <= max_miles */ true
$$;
```

Notes / refinements:
- The `miles <= max_miles` predicate can't reference the computed alias directly; wrap in a
  subquery or repeat the expression. Left inline above for readability.
- **Spatial pruning**: the naïve version still cross-joins all my stops with all friend
  stops in SQL. That's fine at current scale, but to scale cleanly, add a bounding-box
  pre-filter (a crossing within 100 mi implies |Δlat| ≤ ~1.45° and a longitude delta
  bounded by latitude) so an index can help, **or** adopt PostGIS.
- **PostGIS option (recommended if we grow)**: add a `geography(Point)` column to `shows`,
  a GiST index, and use `ST_DWithin(a.geog, b.geog, meters)`. This turns the cross join
  into an indexed spatial join and is the standard, battle-tested approach. Cost: enabling
  the extension + a generated column + backfill (mirrors the Phase-3 country backfill).
- `SECURITY DEFINER` + internal re-check of friendship & visibility keeps the privacy model
  centralized and auditable — this function becomes the *single* place crossing data leaves
  the server.

**Client change**: replace the `useQueries` fan-out with one query calling
`supabase.rpc('crossed_paths', {...})`, mapped to the existing `NearMiss` shape. The pure
`compute.ts` functions stay (useful for the 1:1 Compare screen and tests), but the upcoming
badge path stops downloading friends' full itineraries.

### 4B. Precompute + notifications (built on 4A)

For push ("a friend's tour comes near you soon"), we need detection to run **without the app
open**:

- A `crossed_paths` table (or materialized view) storing detected upcoming pairs, unique on
  `(user_id, my_stop_id, their_stop_id)`.
- A **scheduled job** (`pg_cron` calling the RPC per active user, or an Edge Function) that
  refreshes upcoming crossings, e.g. nightly and/or on write (trigger enqueues affected
  users when a show/venue with coordinates changes).
- New rows for the near future → enqueue a push via an Edge Function + Expo Push
  (`expo-notifications`, a `device_tokens` table, user notification preferences).
- De-dupe so a user isn't notified twice for the same pair; only notify on transition into
  the upcoming window.

This is a larger body of work (scheduling, token management, notification prefs,
delivery) and should be its own project once 4A lands.

## 5. Data & Schema Impact

- **4A minimal**: no schema change strictly required; add an index to support pruning
  (`shows (date) where latitude is not null`, plus the bounding-box or PostGIS index).
- **4A + PostGIS**: `create extension postgis;` + `shows.geog geography(Point,4326)` (generated
  from lng/lat) + GiST index + one-time backfill.
- **4B**: `crossed_paths`, `device_tokens`, `notification_preferences` tables; `pg_cron`
  (or scheduled Edge Function); Expo push credentials.

## 6. Rollout / Migration

1. Ship `crossed_paths` RPC behind the existing UI; keep the client compute as a fallback.
2. Switch `useUpcomingCrossedPaths` to the RPC; verify parity against the client result on
   real data (same pairs, same classification).
3. Delete the client fan-out for the badge path once parity is confirmed (keep `compute.ts`
   for Compare + unit tests).
4. (Later) Add PostGIS if scale demands, then 4B for notifications.

## 7. Tradeoffs

**Benefits**
- Device fetches results, not the friend graph → far less data transfer and on-device work.
- One audited privacy boundary instead of relying on every read path.
- Unlocks push notifications (via 4B).

**Downsides / risks**
- SQL haversine cross-join is still O(n²) without spatial indexing; PostGIS adds an
  extension dependency and a backfill (though it mirrors work we just did in Phase 3).
- `SECURITY DEFINER` functions are powerful; the internal friendship/visibility re-check
  must be correct and tested (RLS won't protect a definer function).
- Behavior parity with the current client math (rounding, `daysBetween`, `sameTour`
  exclusion) must be verified to avoid silently changing results.

## 8. Effort & Risk

- **4A (RPC, no PostGIS):** Effort **Medium**, Risk **Medium** (security-definer correctness).
- **4A + PostGIS:** Effort **Medium**, Risk **Medium** (extension + backfill).
- **4B (precompute + push):** Effort **Large**, Risk **Medium–High** (scheduling, delivery,
  prefs). Recommend as a separate, later phase.

## 9. Open Questions

- Do we want crossings for **followers** too, or strictly accepted friends? (Ties into the
  Follow-vs-Friend proposal — recommend friends-only initially.)
- Nightly refresh vs on-write triggers vs both for 4B?
- Is PostGIS acceptable as a dependency, or keep pure-SQL haversine + bounding box?

## 10. Recommendation

Adopt **4A (on-demand `SECURITY DEFINER` RPC)** first — it removes the scaling/transfer
problems with modest effort and centralizes privacy, while leaving the UI and pure compute
functions intact. Defer PostGIS until data volume justifies it, and treat **4B
(notifications)** as a follow-on project.
