# Design Proposal: Offline Write Support

**Status:** Approved. **Stages 1, 2 & 2.5 complete** (transactional import pipeline, §4.8 — reviewed
and approved, incl. the F-A stable-id fix); **Stage 3** (offline hardening, §4.9) approved via the
post-Phase 4 architecture review and **pending implementation**. Stage-by-stage plan in
[`offline-write-support-checklist.md`](./offline-write-support-checklist.md); post-review findings in
the `phase4-architecture-review` canvas (findings F1/F2/F6/F8).
**Phase:** 4 (Future Planning)
**Author:** Architecture review follow-up

**Approved decisions:** TanStack Query offline mutations · `onlineManager` + NetInfo ·
client-generated UUIDs · defer geocoding until sync · no custom sync engine · a **subtle,
global pending-sync status indicator** (§4.6) · explicit **offline delete** handling (§4.7) ·
offline **reads are best-effort from cache**, not a guarantee of full data availability (§2.1) ·
**all multi-row writes go through atomic, idempotent server-side RPCs**, including the
**transactional import pipeline** (§4.8) · **offline hardening** — session-gated and
identity-validated replay, resilient auth-failure handling, and **queue durability decoupled from
read-cache freshness** (§4.9).

---

## 1. Problem / Motivation

Touring professionals spend real time without connectivity — vans between markets,
backstage, planes, foreign SIM gaps. Tourbook is a *logging* app, so the moment a user
most wants to add a show or off day (right after it happens) is often the moment they have
no signal. Today, **reads work offline but writes fail.** We want create/edit/delete of
tours, shows, and off days to work offline and sync when connectivity returns.

## 2. Current State (as built)

- **Reads (already offline-capable):** [`app/_layout.tsx`](../../app/_layout.tsx) wraps the app
  in `PersistQueryClientProvider` with an AsyncStorage persister
  ([`src/lib/persister.ts`](../../src/lib/persister.ts)) and `maxAge = 24h`
  ([`src/lib/queryClient.ts`](../../src/lib/queryClient.ts)). So previously-loaded tours,
  stops, friends, and stats are readable offline and across restarts.
- **Writes (not offline-capable):** mutations (e.g. `useCreateShow` → `createShow` in
  [`src/features/shows/api.ts`](../../src/features/shows/api.ts)) call Supabase directly. With
  no network the promise rejects, the mutation errors, and the change is lost. There is:
  - no mutation persistence,
  - no `onlineManager`/NetInfo wiring (Query can't tell it's offline),
  - no optimistic cache updates for most mutations,
  - no client-generated IDs (inserts rely on DB `gen_random_uuid()`), so retries aren't
    idempotent.
- **New Phase-3 wrinkle:** the write path now **geocodes** (`resolveShowLocation`,
  `resolveOffLocation`, `getOrCreateVenue` call Mapbox). Geocoding needs network. So an
  offline write can't resolve coordinates/country at write time — this must be handled (see
  §4.4). This is the single most important interaction to get right.

### 2.1 What "offline reads" does and does not mean (clarification)

Offline reads are **best-effort from the persisted TanStack Query cache** (AsyncStorage,
`maxAge = 24h`), **not** a guarantee that all data is available offline. Concretely:

- Only data that was **previously fetched while online** — and hasn't expired past the 24h
  `maxAge` or been evicted — is readable offline.
- Data never loaded on the device (e.g. a tour or a connection's itinerary you never opened,
  a fresh install, or anything after the cache ages out) will simply be **absent** offline.
  Its queries resolve to empty / loading / error states, exactly as today.
- This feature's scope is **queued writes + optimistic UI + previously-cached reads**. It is
  explicitly **not** a full local replica or a "download everything for offline" mode.

This framing keeps expectations honest: we make the *logging* actions work offline and keep
recently-viewed data visible; we do not promise the whole account is browsable with no signal.

> **Durability caveat (addressed in §4.9).** Paused *writes* are persisted in the **same** dehydrated
> snapshot as the read cache, so today the 24h `maxAge` also bounds how long an unsynced write
> survives a closed app. Stage 3 decouples these — the read-freshness knob should not silently govern
> the durability of a user's unsynced data.

## 3. Goals & Non-Goals

**Goals**
- Queue create/update/delete of tours, shows, off days while offline; auto-apply on
  reconnect, in order.
- Optimistic UI: the new/edited stop appears immediately and survives an app restart.
- Idempotent, safe replay (no duplicate rows if a mutation is retried).
- Gracefully handle the geocoding dependency (log offline, geocode on sync).

**Non-Goals**
- Multi-device real-time conflict resolution / CRDTs. Last-write-wins with sensible
  guardrails is enough for a personal logbook.
- Offline auth/login (session must have been established while online).
- Offline photo uploads (separate concern; large binaries need their own queue).

## 4. Proposed Design

Build on TanStack Query's **first-party** offline mutation support rather than a bespoke
queue. This keeps us aligned with the library we already use and avoids new global state.

### 4.1 Detect connectivity (`onlineManager` + NetInfo)

Wire `@react-native-community/netinfo` into Query's `onlineManager` so Query knows when
it's offline and pauses mutations instead of failing them.

```ts
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(!!state.isConnected)),
);
```

(NetInfo is a new dependency; it's the standard Expo-supported way to observe connectivity.)

### 4.2 Persist and resume mutations

- Give every mutation a stable `mutationKey` and register a **default `mutationFn`** per key
  via `queryClient.setMutationDefaults(...)`, so a mutation rehydrated from disk after a cold
  start knows how to run.
- The existing `PersistQueryClientProvider` already persists mutations alongside queries; on
  reconnect call `queryClient.resumePausedMutations()` (and on app launch after hydration).
- Offline, `mutate()` is **paused** (not failed); the `onMutate` optimistic update still runs.

### 4.3 Optimistic updates + client-generated IDs

- Generate the row `id` on the client (UUID) at mutate time and include it in the insert.
  This makes replay **idempotent**: use `upsert(..., { onConflict: 'id' })` (or insert with a
  pre-known id) so a double-send can't create duplicates.
- `onMutate` writes the optimistic row into the relevant cache (`queryKeys.shows.list(tourId)`
  etc.) so it shows instantly; `onError` rolls back; `onSettled` invalidates.
- Ordering matters: a show that references a **new venue** must not sync before the venue
  exists. Prefer collapsing this into a single server call (see §4.4) so there's one ordered
  mutation per user action, not a fragile multi-row dependency in the queue.

**Multi-row writes must be atomic (decision).** Any user action that persists more than one
related row — e.g. creating a tour (writes `tours` **and** `tour_members`) — is done as a
**single server-side transactional RPC**, never as an ordered sequence of separate
PostgREST calls. Two client-side calls in one `mutationFn` are two independent HTTP requests:
a failure between them (very possible during offline replay) commits the first and drops the
second, leaving a **partial record** (a tour with no membership). A Postgres function runs in
one transaction, so the whole action commits or rolls back together, and is made idempotent on
the client-supplied UUIDs (`insert … on conflict (id) do nothing`). Single-row actions
(shows, off days) need no RPC — a single `upsert` is already atomic and idempotent.

### 4.4 Handling the geocoding dependency (key decision)

Geocoding requires network, but offline writes can't wait. Options:

- **(Recommended) Defer geocoding to sync time.** Offline, persist what the user typed
  (city, venue name, address, and any coordinates already picked from search) with
  `country = null` and coordinates null when unknown. When the mutation resumes online, run
  the existing `resolveShowLocation` / `resolveOffLocation` geocoding as part of the
  `mutationFn`. This reuses Phase-3 code paths unchanged and keeps geocoding on the write
  path — it just happens at *sync* time instead of *submit* time.
- **Alternative: a "needs geocoding" flag + background pass.** Insert immediately with raw
  text, set a `needs_geocode` boolean, and have a separate online pass fill coordinates.
  More moving parts; only worth it if we want the row server-side before geocoding.

The recommended option means: **the stop appears on the timeline immediately (offline), and
its map pin/country resolve automatically once connectivity returns** — which matches user
expectations for a logbook.

### 4.5 Server-side idempotency & auth

- `INSERT ... ON CONFLICT (id) DO NOTHING/UPDATE` keyed on the client UUID.
- RLS already scopes writes to the authenticated user; replayed mutations carry the same
  session. A long offline period could expire the token — `resumePausedMutations` must run
  *after* the session is refreshed, and surface a clear error if refresh fails.

### 4.6 Pending-sync indicator (decision)

**Decision: ship a single, subtle, app-level pending-sync status indicator.** No blocking
spinners, no modal, no per-action toast.

- **Source of truth:** derive it from state we already have — `onlineManager`'s online/offline
  flag plus the mutation cache (`useIsMutating()` / `useMutationState()` filtered to our
  offline mutation keys, counting `paused` + in-flight replays). No new global store.
- **Form & placement:** a small, unobtrusive affordance (a pill / thin bar / header dot) that
  is **hidden when there's nothing pending** and appears only when there are queued or
  replaying mutations. Suggested copy:
  - Offline with queued work → "Offline · N change(s) will sync".
  - Reconnecting/replaying → "Syncing N…".
  - Replay failed (e.g. token refresh failed, server rejected) → "Couldn't sync · Retry",
    where Retry calls `resumePausedMutations()`.
- **Per-row marker (optional, v1.1):** a subtle dot on optimistic rows not yet synced. Nice
  but not required for v1 — the global indicator is the committed decision; the per-row marker
  is a follow-on if it proves useful.
- **Why subtle:** this is a logbook; queued writes are the *normal* offline case, not an error.
  The indicator should reassure ("your change is saved and will sync"), not alarm.

### 4.7 Offline deletes (explicit handling)

Deletes follow the same queue-and-replay model, with delete-specific rules:

- **Optimistic removal:** `onMutate` removes the row from the relevant caches immediately (and
  restores it in `onError`). For a **tour** delete, also purge the dependent caches
  (`shows.list(tourId)`, `tours.members`, `tours.membership`, `tours.detail`) since the server
  cascades via `ON DELETE CASCADE` — mirror the invalidations already in `useDeleteTour`, done
  optimistically.
- **Idempotent replay:** deletes are `delete … where id = <clientOrServerId>`, which is a
  no-op if the row is already gone. Safe to retry; safe if it races a re-created id (won't
  happen because ids are client-generated and unique).
- **Delete of a still-unsynced create (key case):** if the user creates a stop/tour offline
  (a *paused create* in the queue) and then deletes it before reconnecting, we avoid a pointless
  create→delete round trip: on delete, if a paused create for that **client UUID** exists in the
  mutation cache, **cancel/remove that queued create** and skip enqueuing the delete (the row
  never reached the server). **Safety net:** even if we don't catch it, correctness still holds
  because create is an `upsert(onConflict: id)` and delete is idempotent by id, and Query replays
  in submission order — so create-then-delete converges to "deleted". The dequeue is an
  efficiency optimization, not a correctness requirement.
- **Orphaned catalog rows:** cancelling a queued create means its deferred `getOrCreateVenue`
  never runs, so no orphan. If a create *did* sync and then a delete removes the stop, any venue
  it created stays in the shared catalog (by design — venues are shared, deduped reference data).
- **Ordering with edits:** a queued `update` followed by a `delete` of the same id replays in
  order and converges to deleted; a `delete` then a later `update` (of a now-deleted id) is a
  no-op update — acceptable, no error surfaced.

### 4.8 Transactional import pipeline (Stage 2.5)

**Rationale.** §4.3 committed us to a principle: *any* multi-row user action commits through a single
atomic, idempotent server-side RPC — never an ordered sequence of PostgREST calls that can fail
halfway and leave a partial record. Tour **create/update** already follow this
(`create_tour_with_membership`, `update_tour_with_role`). **AI import is the one remaining multi-row
write that does not:** `createImportedTour` creates the tour via the RPC, then loops `createShow`
once per stop. The post-Phase 4 review (finding **F1**) flagged this as an architectural
inconsistency — a mid-loop failure leaves a tour with a *partial itinerary*, the per-stop inserts use
no client id (so a retry duplicates rows), and the whole action is a plain online mutation that is
lost on a cold start. Stage 2.5 closes that gap. It is treated as a **standalone
architectural-consistency task**, deliberately separate from the Stage 3 offline-hardening work.

**Why not simply make import fully offline?** Import is fundamentally a *connected* action: the parse
step calls the `parse-tour` edge function (LLM), and the review step geocodes/reverse-geocodes each
stop through Mapbox. Neither can run without network, so "queue a raw import offline and sync later"
would buy almost nothing while adding real complexity. The honest model is **online to prepare,
atomic to commit** — which also matches how every other write already defers geocoding to a live
connection (§4.4).

**Design — online preparation + one atomic, idempotent bulk RPC:**
- **Prepare (online, unchanged):** parse the text, then resolve each stop in the review screen —
  match/create venues (`getOrCreateVenue`, deduped) and geocode coordinates/country. By the time the
  user confirms, every stop is fully resolved and carries a **stable client-generated show id**. The
  **tour id and every show id are minted once per review session** (the tour id when the parse
  produces the list; each show id when its row is created) and held in the screen — *not* regenerated
  per submit — mirroring the create-tour pattern (`CreateTourVars = CreateTourInput & { id: string }`).
  They are passed as the mutation variables, so a retry or re-tap re-sends the **same** ids.
- **Commit (one transaction):** a new `SECURITY DEFINER` function
  `create_imported_tour(p_tour_id, p_act_id, p_act_name, p_title, p_start_date, p_end_date,
  p_visibility, p_role, p_stops jsonb)` creates the tour, the creator's membership, and **all** shows
  in a single transaction. It reuses the `create_tour_with_membership` **ownership guard** (a caller
  may only create a tour under an id they own; a non-owner passing an existing id is rejected, an
  owner replaying is an idempotent no-op) and resolves the act via `get_or_create_act`. Each stop is
  inserted by its client id with `on conflict (id) do nothing`, so replay converges to exactly N
  shows with no duplicates.
- **Venues stay client-side.** Because venues are resolved during the (online) review step, the RPC
  receives ready `venue_id`s or inline city/coords and performs **pure inserts** — no venue dedup in
  SQL. This keeps the function small and the dedup logic in exactly one place.
- **Client stays online-only but robust.** `useCreateImportedTour` remains a normal (non-persisted)
  mutation — it is *not* added to the offline `setMutationDefaults` registry, because its preparation
  can't run offline anyway. It uses `networkMode: 'always'` so an offline confirm **fails fast**
  (surfaced by the review screen) instead of silently pausing in an in-memory queue. Because the
  stable ids are reused on retry, the idempotent RPC makes a flaky-network commit — or a lost-ack
  re-tap — converge to a single tour with no duplicate shows.

**Net effect:** import can no longer create a partial tour, is safe to retry (a re-tap after a lost
acknowledgement re-sends the same ids and converges, rather than duplicating), and follows the same
atomic-RPC contract as every other multi-row write — without pretending to be a fully offline action
it cannot be.

### 4.9 Offline hardening (Stage 3)

Stage 3 is scoped **only** to making the already-shipped offline write path robust — no new offline
surface area. It groups into replay/auth, durability, and sync UX. (Import atomicity is Stage 2.5,
not Stage 3.)

**Replay & auth.**
- **Session-gated replay.** `resumePausedMutations` must run only *after* the session is
  validated/refreshed (already the case on cold start). A long offline gap can expire the token;
  replaying with a stale token would error the whole queue. On refresh failure we surface
  "Couldn't sync · Retry" rather than silently failing the queued writes.
- **Replay identity validation (F6).** A queued write carries the `userId` it was created under.
  Before replaying, confirm it matches the current session user, so a queue can never replay under a
  *different* account (e.g. sign out → sign in as someone else on a shared device). This is
  defense-in-depth: server RLS is the real backstop (`created_by = auth.uid()` on shows; owner checks
  inside the tour RPCs), so a misattributed replay already fails closed — but we prefer never to send
  it. `signOut` already clears the query + mutation caches; Stage 3 also makes that clearing work when
  `signOut` can't reach the server (offline sign-out).

**Durability (F2) — decouple queue lifetime from read-cache freshness.**
- **Problem.** Paused mutations are persisted in the *same* dehydrated snapshot as the read cache, and
  `PersistQueryClientProvider` discards the whole snapshot at hydration if it is older than `maxAge`
  (currently 24h). So a write made offline and not reopened within 24h is **silently dropped** — a
  read-freshness knob doubling as the durability guarantee for unsynced user data.
- **Key insight.** `maxAge` only gates *restore-vs-discard of the snapshot at hydration*; it does
  **not** control online read freshness — `staleTime`/`gcTime` do. Raising `maxAge` therefore does
  not make online reads staler; it only lengthens how long we trust an offline snapshot and, with it,
  how long a queued write survives a closed app.
- **Decision.** Keep `staleTime`/`gcTime` as the freshness controls and **raise the persister
  `maxAge` to ~30 days** so realistic offline gaps no longer drop queued writes. Pair it with a
  persistence **`buster`** tied to the app/schema version: bumping it invalidates the persisted cache
  (and queue) on upgrade, so a mutation queued under an old variable shape can never replay against
  changed code (this also closes finding **F8**). The trade-off is that offline *reads* can be shown
  staler (up to the new window) — acceptable for a logbook, where stale-but-present beats absent.

**Sync UX.**
- The subtle indicator (§4.6) gains a real **"Couldn't sync · Retry"** state driven by the auth
  handling above, plus the optional per-row "unsynced" marker already noted as a v1.1 follow-on.

## 5. Data & Schema Impact

- Minimal. Client-generated UUIDs work with existing `uuid primary key default
  gen_random_uuid()` columns (the default is simply overridden by the supplied id).
- Optionally add `updated_at`-based last-write-wins guards (most tables already have
  `updated_at` via `set_updated_at`).
- If we choose the flag-based geocoding approach: add `needs_geocode boolean` to `shows`
  (not needed for the recommended defer-to-sync approach).
- **Stage 2.5** adds a `create_imported_tour` `SECURITY DEFINER` **function** (alongside the existing
  `create_tour_with_membership` / `update_tour_with_role`) — no table or column changes.
- **Stage 3** durability is **client config only** (persister `maxAge` + `buster`); no schema changes.

## 6. Rollout / Migration

Delivered incrementally; the detailed, file-level plan lives in the
[checklist](./offline-write-support-checklist.md). Stages:

1. **Stage 1 — Foundation + pilot (done):** NetInfo + `onlineManager`, persisted/resumable mutations,
   the `setMutationDefaults` registry, client UUIDs, and one mutation (create off day) converted and
   validated offline→online.
2. **Stage 2 — Rollout + deletes + indicator (done):** all show/off-day/tour create/update/delete on
   the offline pattern (deletes per §4.7), tour create/update via transactional RPCs, and the subtle
   global pending-sync indicator (§4.6).
3. **Stage 2.5 — Transactional import pipeline (§4.8):** the `create_imported_tour` bulk RPC; import
   becomes online-to-prepare, atomic-to-commit. A standalone architectural-consistency task, kept
   separate from Stage 3.
4. **Stage 3 — Offline hardening (§4.9):** session-gated + identity-validated replay, resilient
   auth-failure handling, durability (persister `maxAge` + version `buster`), and sync-UX polish.
5. Document the pattern so new mutations follow it (contributor note).

## 7. Tradeoffs

**Benefits**
- Core logging works where users actually are (offline), with instant, durable UI.
- Uses the library's built-in mechanism → little new surface area, no custom sync engine.
- Reuses Phase-3 geocoding untouched (just deferred to sync).

**Downsides / risks**
- New dependency (NetInfo) and added mutation complexity (optimistic update + rollback per
  mutation).
- Last-write-wins can lose a concurrent edit made on another device; acceptable for a
  personal logbook but should be a conscious decision.
- Token expiry across long offline gaps needs careful handling to avoid a stuck queue.
- Persisted mutations in unencrypted AsyncStorage carry the same
  data-at-rest tradeoff already noted in `persister.ts`.
- Raising the persistence `maxAge` to keep the write queue durable (§4.9) means offline *reads* can be
  served staler (up to the new window). Acceptable for a logbook; online reads are unaffected because
  freshness is governed by `staleTime`/`gcTime`, not `maxAge`.

## 8. Effort & Risk

- **Connectivity wiring + first mutation:** Effort **Small–Medium**, Risk **Low–Medium**.
- **Full rollout across tours/shows/off-days with optimistic updates:** Effort **Medium**,
  Risk **Medium** (correctness of optimistic cache patches + replay ordering).

## 9. Open Questions

**Resolved (this revision):**
- ✅ Geocoding: **defer to sync** (recommended option in §4.4) — confirmed; no `needs_geocode` flag.
- ✅ Pending indicator: **yes, a subtle global indicator** (§4.6), not silent sync.
- ✅ Offline deletes: handled explicitly (§4.7).
- ✅ Offline reads: **best-effort from cache**, not guaranteed full availability (§2.1).
- ✅ Multi-row atomicity for **import**: transactional bulk RPC, online-to-prepare/atomic-to-commit
  (§4.8, Stage 2.5).
- ✅ Token expiry / stuck queue across long offline gaps: **session-gated + identity-validated replay**
  with a "Couldn't sync · Retry" fallback (§4.9, Stage 3).
- ✅ Queue durability vs read-cache freshness: **decoupled** — raise the persister `maxAge` (~30d) and
  add a version `buster` (§4.9, Stage 3).

**Still open (not blocking):**
- Is last-write-wins acceptable, or do we want per-field merge for edits? (Default: **LWW**.)
- Should `join`/`leave` become offline-capable, or stay online-only? (Currently online-only; a
  possible Stage 3 *stretch* for an already-cached tour. **AI import stays online-only by design** —
  see §4.8.)

## 9.1 Deferred Review Findings (F3–F5)

The post-Phase 4 architecture review surfaced three further findings (`phase4-architecture-review`
canvas). Each was reviewed and **intentionally deferred** — they are **not scheduled** for Stage 2.5
or Stage 3, and Stage 3 scope is unchanged (auth/replay, durability, sync UX). They are recorded here
so the decision to postpone is explicit and traceable, each with a trigger for revisiting.

- **F3 — Replay ordering for dependent multi-row batches (offline tour + its shows).**
  *Finding:* a show's insert requires tour membership, which only exists after the tour-create RPC
  commits; correctness relies on in-order sequential replay, and a tour-create that *hard*-fails is
  swallowed (`continue().catch(noop)`), so dependent show-creates then fail RLS individually.
  **Decision: deferred.** *Rationale:* on the happy path the FIFO replay + idempotent upserts already
  converge; the failure mode is narrow (requires a non-transient tour-create failure) and results in
  a full optimistic **rollback**, not corrupted data — and the Stage 3 "Couldn't sync · Retry" UX will
  surface a stuck queue. A real batch/dependency mechanism (grouping child writes under a parent, or
  blocking dependents until the parent commits) is meaningful complexity we don't want to add
  speculatively. *Revisit when:* testing/telemetry shows real partial-batch failures, or when tour
  inheritance/forking lands (it adds more multi-entity writes and would benefit from a shared
  mechanism).

- **F4 — Stale connection-gated data in the persisted cache after access is revoked.**
  *Finding:* a removed connection's tours/crossings/roster can remain readable from the device's
  persisted cache until an invalidation **and** a successful online refetch (impossible offline), for
  up to `maxAge`.
  **Decision: deferred.** *Rationale:* this is the inherent tradeoff of any offline cache; the window
  is bounded by `maxAge` and corrected on the next online refetch, the data at rest is the same
  RLS-protected personal data already discussed in `persister.ts`, and `signOut` clears everything.
  Pre-launch there are no external users, and the exposure is "someone you just disconnected can still
  see, on their own device, data they had already loaded" — not new leakage. Proactive eviction of a
  removed connection's cached data is feasible but adds targeted cache-eviction logic best added
  deliberately. *Revisit when:* approaching public launch, or when connection removal/blocking becomes
  a security-sensitive real-user feature — then evict that user's cached tours/crossings on the
  mutation and consider a shorter `maxAge` for connection-scoped queries.

- **F5 — Membership mutations (`join`/`leave`/role) are not offline-capable and lack optimistic UI.**
  *Finding:* these are plain online-mode mutations with no `mutationKey`/default and no optimistic
  update, so offline they pause without feedback, an awaiting screen can hang, and a paused one is
  lost on restart.
  **Decision: deferred** (this is the "Stage 3 stretch" noted in §9, explicitly **not** pulled into
  Stage 3). *Rationale:* joining/leaving is an inherently connected, social action (discovery needs a
  live catalog read; membership touches a shared entity), so the value of queuing it offline is low
  relative to logging one's own shows/off days. Current behavior is correct within a session (it
  resumes on reconnect); the rough edges are UX (no optimistic feedback, possible awaiting-hang), not
  correctness. *Revisit when:* users ask for offline join/leave, or when tour inheritance/forking
  reworks membership semantics anyway — fold it in there.

## 10. Recommendation

Adopt TanStack Query's built-in offline mutation support: wire `onlineManager` to NetInfo,
use **client-generated UUIDs + optimistic updates + `setMutationDefaults` + persisted,
resumable mutations**, and **defer geocoding to sync time** so Phase-3 write-path code is
reused unchanged. Pilot on one mutation, verify the offline→online round trip, then roll
out. Avoid building a custom sync engine or introducing global state.

Stages 1 & 2 are implemented on this basis. Two follow-ups, approved via the post-Phase 4 review,
complete the picture: **Stage 2.5** brings AI import onto the same atomic-RPC contract as every other
multi-row write (§4.8), and **Stage 3** hardens the shipped path — session-gated + identity-validated
replay, resilient auth-failure handling, and queue durability decoupled from read-cache freshness
(§4.9). Neither adds new offline surface area; both make the existing model correct and durable.
