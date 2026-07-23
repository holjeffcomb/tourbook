# Stage 1 — Social Model Implementation Checklist

Status: **Planning only. No code changes yet.**
Source of truth: [`social-model.md`](./social-model.md) (design finalized).

This checklist maps every Stage 1 change to concrete **files**, **tables**, **migrations**,
and **tests**. Stage 1 delivers the product/UX model plus the schema/RLS tightening that
makes the model *true at the data layer* — not just in the UI.

---

## 0. Scope

### In scope (Stage 1)
1. Retire **Public** visibility. Visibility becomes **Private / Connections**; default **Private**.
2. Silently migrate existing `public` (and default) tours → Private.
3. Enforce **Membership ≠ Access** at the RLS layer (tighten `tours`, `shows`, `tour_members`).
4. Add **catalog-linkage RPCs** so act/venue discovery + join-not-duplicate keep working
   *without* exposing itineraries (replacing today's reliance on `public` + open `tour_members`).
5. Ensure **personal notes / annotations are owner-only** (audit today's fields; reserve the pattern).
6. Verify **Crossing Paths + notifications remain connection-only** (they already are — regression-guard it).
7. **UX rename:** "Friends" → "Connections" (labels/copy only; keep `friendships` table + route paths).

### Explicitly out of scope (later stages)
- Publishing pipeline (public link pages, recaps, share cards, `published_*` tables).
- Roster-visibility policy decision beyond the conservative Stage 1 default (see §2.3 open question).
- Enum cleanup (physically dropping the `'public'` enum value) — deferred; value is retired-but-retained.
- Blocking UX (model defines it; implement when connection request UX is revisited).

### Guiding invariants (must hold after Stage 1)
- A non-connected user — **including a co-member of the same tour** — can see **only** a tour's
  shared skeleton (identity/dates/venues/roster per §2.3), never notes, personal stats, or other tours.
- The only paths to another user's personal tour data are: **owner**, **connection + `connections` visibility**.
- Crossings never use membership as a permission mechanism.

---

## 1. Retire Public visibility + default Private + data migration

**Behavior:** `visibility` is presented as `private | connections`. `public` is removed from the
picker, migrated away in data, and dropped from all RLS `using` clauses. We **keep the `'public'`
enum value physically** (Postgres enum-value removal is disruptive) but leave it unused; likewise we
keep the enum label `'friends'` at the DB layer and treat it as "Connections" (UX-only rename), mirroring
the earlier `friendships`-table decision.

| Area | Files / Tables |
|---|---|
| Zod schema + option list | `src/features/tours/schema.ts` (`createTourSchema` enum → `['connections','private']`; rewrite `VISIBILITY_OPTIONS`, drop the Public row, relabel `friends`→"Connections") |
| Form picker | `src/features/tours/TourForm.tsx` (renders `VISIBILITY_OPTIONS`; verify default + copy) |
| Create/Edit default values | `src/features/tours/CreateTourScreen.tsx`, `src/features/tours/EditTourScreen.tsx` (default `visibility: 'private'`) |
| Type surface | `src/features/tours/api.ts` (`TourVisibility`), `src/lib/database.types.ts` (leave enum union as-is; no need to remove `'public'`) |
| Public-profile read path | `src/features/tours/api.ts` `listMemberTours(..., { publicOnly })` + `PublicProfileScreen.tsx` — `publicOnly` no longer means anything under Option B; decide: strangers see nothing personal (return catalog-only or empty). Update callers. |
| Any hard-coded `'public'` copy/logic | `src/features/tours/queries.ts`, `src/features/social/*` — grep `'public'` and remove branches |

**Migration:** `supabase/migrations/<ts>_retire_public_visibility.sql`
- `update tours set visibility = 'private' where visibility = 'public';`
- `alter table tours alter column visibility set default 'private';`
- (Enum value `'public'` intentionally left in place; add a comment noting it's retired.)

**Tests**
- `src/features/tours/schema.test.ts` (new): enum rejects `'public'`, accepts `private`/`connections`; default is `private`.
- Update `src/features/tours/tourMode.test.ts` if it asserts on visibility options/labels.
- Manual/SQL: after migration, `select count(*) from tours where visibility='public'` = 0.

---

## 2. Membership ≠ Access — RLS tightening

This is the load-bearing change. Today (`20260711080100_friends_visibility_policies.sql` +
`20260711010100_shared_tours.sql`):
- `tours` SELECT = `public OR (friends AND is_friends) OR member`.
- `shows` SELECT mirrors it.
- `tour_members` SELECT = **`using (true)`** — every authenticated user can read every roster. This
  currently powers act-crew / venue-players cross-user reads and violates the new model.

**Migration:** `supabase/migrations/<ts>_membership_not_access.sql` (must run *after* §1)

### 2.1 `tours` SELECT
Drop `"Tours are viewable by public, friends, or members"`; recreate as:
```
owner (created_by = auth.uid())
OR (visibility = 'friends' AND is_friends(created_by, auth.uid()))
OR member of tour   -- members may see the tour row (shared skeleton), not its personal layer
```
Remove the `visibility = 'public'` branch. (Keeping the `member` branch here is what lets a co-member
see the *shared skeleton*; the personal layer is protected in §2.2 / §4.)

### 2.2 `shows` SELECT
Drop `"Shows are viewable when their tour is"`; recreate mirroring §2.1 (owner / connection / member),
with the `public` branch removed. Shows = the shared schedule (venues/dates) = part of the skeleton, so
member visibility is retained. **Personal annotations must not live on `shows` as world/member-readable
free text** — see §4 for the `shows.label`/off-day-note audit.

### 2.3 `tour_members` SELECT (the key tightening) — DECIDED: most privacy-preserving

Drop `"Tour members are viewable by authenticated users"` (`using (true)`). Replace with the
**most privacy-preserving** scoping (per approved decision — tour membership is professional context,
never a permission grant, and we must not build a public crew directory):
```
own membership          (user_id = auth.uid())
OR connection of member (is_friends(user_id, auth.uid()))   -- "which of my connections are here"
OR I own the tour       (tours.created_by = auth.uid())      -- owner sees the full roster
```
**Explicitly NOT** a "co-member of the same tour" branch. A non-connected co-member can see the tour's
shared skeleton (tour row + schedule) but **cannot enumerate the roster**. Full-roster visibility for
non-owners becomes an *intentional, separately-governed feature later*, not an implicit membership effect.

To avoid mutual RLS recursion (`tours` SELECT references `tour_members`, and this policy references
`tours`), both branches that cross tables go through `security definer` helper functions
(`public.can_view_tour`, `public.owns_tour`) that use `auth.uid()` internally — mirroring `is_friends`.

Consequence for §3: there is **no public crew directory**. Act/venue "crew"/"players" surfaces show only
the viewer's connections (+ own memberships). Non-connected participants are not enumerated. This is the
desired end state, so §3's catalog RPCs are scoped to **entity metadata + aggregate counts only**, never
name enumeration of non-connections.

**Insert/update/delete policies** for `tours`/`shows`/`tour_members` are already owner/member-scoped
and need **no change** — audit only.

**Tests** (SQL, transaction-rolled-back harness like the `crossed_paths` verification):
`supabase/tests/membership_not_access.sql` (new)
- Non-connected co-member: can `select` the tour row + shows (skeleton); **cannot** read another tour of that owner.
- Stranger (no membership, no connection): sees **0** rows for a private tour's `tours`/`shows`/`tour_members`.
- Connection with `connections` visibility: sees the tour + shows.
- `tour_members` no longer world-readable (stranger gets 0 rows for an unrelated tour).

---

## 3. Catalog-linkage RPCs (preserve discovery without leaking itineraries)

Once §1–§2 land, these existing cross-user reads **break** because they depend on `public` visibility
and/or the open `tour_members` policy:

| Read (breaks) | File | Depends on |
|---|---|---|
| Tours-for-act list | `src/features/tours/api.ts` (`searchToursByAct` / `useTourSearch`) → `ActDetailScreen` | `tours.visibility='public'` |
| "Crew who worked this act" | `src/features/acts/api.ts` `listActCrew` → `ActDetailScreen`, `useActCrew` | open `tour_members` + public tours |
| "Players at this venue" | `src/features/venues/api.ts` `listVenuePlayers` → `VenueDetailScreen` | open `tour_members` + public tours |

**Fix:** introduce `security definer` **catalog RPCs** (pattern already established by
`20260712000000_search_venues.sql` and `20260721000000_crossed_paths_rpc.sql`) that expose only
**non-sensitive catalog metadata** — existence, act/venue name, aggregate counts, member display
names/handles + roles — independent of visibility, and **never** dates, notes, stats, or itinerary.

**Migration:** `supabase/migrations/<ts>_catalog_linkage_rpcs.sql`
- `act_catalog(act_id)` → tours on the act (id, title, member_count, coarse date range if we deem it non-sensitive — **default: omit dates**) + distinct crew (user_id, display_name, username, role, tour_count).
- `venue_players(venue_id)` → distinct players (user_id, display_name, username, show_count).
- Both mark connections client-side using the caller's connection set (as today via `friendIds`).

| App changes | Files |
|---|---|
| Call RPCs instead of table reads | `src/features/acts/api.ts` (`listActCrew` + new tours-for-act fn), `src/features/venues/api.ts` (`listVenuePlayers`), `src/features/tours/api.ts` (`searchToursByAct`) |
| DB types | `src/lib/database.types.ts` (add RPC signatures + return types) |
| Query keys | `src/lib/queryKeys.ts` (reuse existing act/venue keys; no new invalidation semantics) |
| Consumers unchanged in shape | `ActDetailScreen.tsx`, `VenueDetailScreen.tsx` (return types kept identical, like the crossed-paths refactor) |

**Tests**
- SQL: RPC returns catalog rows for a **private** tour's act/venue to a stranger (proves catalog linkage), while `tours`/`shows` direct selects for that stranger still return 0 (proves no itinerary leak).
- SQL: RPC output contains **no** date/notes/stats columns (schema assertion).
- Jest: `listActCrew`/`listVenuePlayers`/`searchToursByAct` map RPC rows to the existing return types (shape parity).

---

## 4. Personal notes / annotations — AUDIT RESULT: no new column needed

**Audit findings (source of truth for Stage 1):**
- There is **no dedicated "personal notes" table or column** in the schema. The one free-text
  annotation is `shows.label` (`20260711040000_add_off_days.sql`): *"label doubles as an optional note,
  e.g. 'Travel day'."* It lives on the `shows` row and is used by `src/features/shows/OffDayForm.tsx`.
- `shows.label` is part of the **shared itinerary/schedule (skeleton)**. It is governed entirely by the
  `shows` SELECT policy, which after §2 resolves to **owner OR the creator's connections
  (`connections` visibility) OR tour members** — the same gate as every other stop field (date/venue/city).
- The other `notes`/`note` grep hits (`ProfileScreen.tsx`, `StatsContent.tsx`, `shows/api.ts`) are
  local UI/state or the same `label` field — **none introduce a cross-user leak**.

**Conclusion (approved: audit-and-document, do not add a column):**
The current data model **already supports** the Stage 1 privacy guarantee — no personal free-text is
exposed to non-connected **non-members**, because everything personal is gated by the `tours`/`shows`
SELECT policies. Therefore **Stage 1 adds no notes column and no `personal_notes` migration.**

Documented follow-up (not Stage 1): if we later want a note that is private **even from co-members and
connections** (owner-only), `shows.label` cannot express that (it's schedule-scoped). That would require
a new owner-only column/table with RLS `created_by = auth.uid()` — deferred until such a feature is
actually requested, so we don't add unused schema now.

**Tests**
- SQL (in §2 harness): confirm a non-connected **non-member** gets **0** `shows` rows (so `label` is not
  leaked). No separate owner-only-field test is needed since no such field is introduced.

---

## 5. UX rename: Friends → Connections

**Labels/copy only.** Keep the `friendships` table, the `is_friends()` RPC, `queryKeys.friends`,
route file paths (`app/(app)/people/friends.tsx`, `/people/requests`, `/people/crossed-paths`), and
hook names to avoid churn. Rename **user-visible strings** and, optionally, component display copy.

| Surface | Files | Strings |
|---|---|---|
| Friends list | `src/features/social/FriendsListScreen.tsx` | header `"Friends"`→"Connections"; `"No friends yet."`; `"Couldn't load friends."`; `"Unfriend"`→"Remove connection" |
| Requests | `src/features/social/FriendRequestsScreen.tsx` | request copy |
| Friends' tours | `src/features/social/FriendsToursScreen.tsx`, `useFriendsTours.ts` | screen title / empty copy |
| People search / add | `src/features/social/PeopleSearchScreen.tsx`, `PublicProfileScreen.tsx` | "Add friend"→"Connect" / "Request connection" |
| Act detail sections | `src/features/acts/ActDetailScreen.tsx` | "Friends who worked this act"→"Connections who worked this act"; "None of your friends yet." |
| Venue detail | `src/features/venues/VenueDetailScreen.tsx` | friends section copy |
| Tab bar | `src/features/maps/FloatingTabBar.tsx` | "Friends' Tours" tab label/a11y; keep `route.name === 'friends-tours'` |
| Settings | `src/features/settings/SettingsScreen.tsx` | any "friends" copy |
| Compare / near-miss | `CompareScreen.tsx`, `NearMissScreen.tsx`, `NearMissListCard.tsx`, `UpcomingCrossedPathsScreen.tsx` | incidental copy |
| Visibility hint | `src/features/tours/schema.ts` | "Connections" hint text (from §1) |

**Tests**
- Light snapshot/label assertions where they already exist; otherwise manual copy review. No logic tests needed (rename is cosmetic). Keep internal identifiers stable so existing tests don't churn.

---

## 6. Crossing Paths + notifications stay connection-only (regression guard)

Already connection-scoped after the server-side refactor (`crossed_paths` RPC requires `is_friends`).
Stage 1 only needs to **guard against regressions** introduced by §2/§3.

| Check | Files |
|---|---|
| RPC still requires friendship, ignores membership | `supabase/migrations/20260721000000_crossed_paths_rpc.sql` (no change; re-verify after §2 policy edits) |
| Client hooks/keys unchanged | `src/features/social/useUpcomingCrossedPaths.ts`, `src/features/social/api.ts` (`listCrossedPaths`), `src/lib/queryKeys.ts` (`friends.crossings`) |
| Invalidation still fires | `src/features/shows/queries.ts`, `src/features/tours/queries.ts` (`invalidateCrossings`) |

**Tests**
- SQL: `crossed_paths` returns a crossing for two **connections** on overlapping stops, and **no**
  crossing for two **co-members who are not connections** (proves membership ≠ crossing).

---

## Migration order (incremental; backwards-compatible / fail-closed)

Delivered in small, independently-applyable steps. Each tightens access (fail-closed), so applying a
DB migration ahead of the client only makes visibility *stricter*, never crashes the client.

1. **`20260722000000_retire_public_visibility.sql`** (§1 data + default) — **DONE**
2. **`20260722000100_membership_not_access.sql`** (§2 RLS on `tours`, `shows`, `tour_members` + helpers) — **DONE**
3. **`20260722000200_catalog_linkage_rpcs.sql`** (§3 — `search_tours_by_act`; entity metadata + member
   count only, creator name gated to viewers who can already see the tour, **no roster enumeration**) — **DONE**
4. ~~personal notes migration~~ — **removed** (see §4 audit; no column added).

App code shipped: visibility picker + `createTour` default (§1); `searchToursByAct` → RPC + DB types (§3);
Friends→Connections copy rename across all user-facing surfaces + tab title (§5). Act/venue **crew/players**
lists need no RPC — after §2 they degrade via RLS to connections-only (the intended no-crew-directory state).

---

## Test matrix (summary)

| Layer | Tool | What |
|---|---|---|
| Pure/schema | Jest | visibility enum/default; RPC-row → type mapping (act crew, venue players, tours-for-act) |
| RLS | SQL harness (tx rollback, `set local role`/`request.jwt.claims`) | stranger/co-member/connection matrix for `tours`, `shows`, `tour_members`; owner-only notes; crossings connection-only |
| Type/build | `tsc --noEmit` + lint | database.types + api return-type parity |
| Manual | app walkthrough | act/venue pages populate via catalog RPC; visibility picker shows only Private/Connections; "Connections" copy everywhere |

---

## Decisions locked (previously open questions)

1. **Roster scope** (§2.3): **DECIDED — most privacy-preserving.** Owner sees the full roster; everyone
   else sees only their own membership + connections. No co-member enumeration, no public crew directory.
   Full-roster visibility for non-owners is a future intentional feature with its own rules.
2. **`shows.label` classification** (§4): **DECIDED — it is shared-schedule (skeleton) content**, gated by
   the `shows` SELECT policy. No new owner-only column added in Stage 1.

## Still-open (non-blocking, later increments)

- **Coarse dates in catalog** (§3): expose a tour's date *range* on act pages, or omit entirely? Default: omit.
- **Public-profile stranger view** (§1): **DECIDED — removed, not preserved.** The old
  `usePublicToursForUser` / `listPublicToursForUser` / `listMemberTours({ publicOnly })` path (which
  relied on retired `public` visibility) is deleted; non-connections now see no tours section on a
  profile. Public profiles / published artifacts are deferred to the future **Publishing** phase rather
  than shipping a temporary stand-in.
- **`shows.created_by` on member-visible shows** (§2.2 nuance): a co-member viewing the shared schedule can
  infer other members via `shows.created_by`. Acceptable for Stage 1 (schedule is shared context); revisit
  if we later want to hide authorship of individual stops from non-connected co-members.
