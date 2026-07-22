# Offline Write Support — Implementation Checklist

Status: **Stages 1, 2 & 2.5 complete** (2.5 reviewed + approved, incl. the F-A stable-id fix).
**Stage 3** (offline hardening: auth/replay + durability + UX — incl. F2) planned, **pending review
before implementation**.
Source of truth: [`offline-write-support.md`](./offline-write-support.md) (approach approved).
Post-Phase 4 architecture review + decisions: canvas `phase4-architecture-review` (findings F1/F2).

**Approved decisions (post-Phase 4 review):**
- **F1 → Stage 2.5 (separate architectural-consistency task, not folded into Stage 3).** Import is
  the last multi-row write that skipped the atomic-RPC treatment used by
  `create_tour_with_membership`. Adopt **Option A**: import stays *online to prepare* (parse +
  resolve venues/geocode) and *commits atomically* via a single transactional, idempotent bulk RPC.
- **F2 → Stage 3 (durability).** Decouple the persistence `maxAge` from read-freshness and raise it
  (~30d) so offline-queued writes aren't silently dropped after 24h, and add a persistence `buster`
  tied to the app/schema version so stale-shaped queued mutations can't replay after an app update.

**Stage 1 done:** `@react-native-community/netinfo` + `expo-crypto` installed · `onlineManager`
wired to NetInfo (`src/lib/offline/onlineManager.ts`) · UUID helper (`src/lib/uuid.ts`) ·
`setMutationDefaults` registry (`src/lib/offline/mutationDefaults.ts`) · `mutationKeys`
(`src/lib/queryKeys.ts`) · pure optimistic helpers (`src/features/shows/optimistic.ts`) ·
`createOffDay` idempotent (`upsert onConflict id`) · `useCreateOffDay` converted ·
resume-on-cold-start + init wired in `app/_layout.tsx`.

**Stage 2 done:**
- All show/off-day/tour **create/update/delete** converted to the offline pattern (client id +
  `mutationKey` + `setMutationDefaults` optimistic/rollback/invalidate + deferred geocode).
- `createShow` idempotent (`upsert onConflict id`); creates use client ids.
- **Multi-row tour create/update via transactional RPCs** (migration
  `20260723000000_create_tour_with_membership.sql`): `create_tour_with_membership` and
  `update_tour_with_role` (both `SECURITY DEFINER`, idempotent on the client tour id, resolve the
  act server-side via `get_or_create_act` so the whole action is offline-replayable). Applied +
  functionally verified locally (create×2 → 1 tour/1 member; update applies; no partial records).
  - **Security guard:** `create_tour_with_membership` grants membership ONLY for a tour the call
    actually creates. If the client-supplied id already exists, the original creator replaying is
    an idempotent no-op; any other caller is rejected (`42501`) and gets no membership — closing
    the "attach to an arbitrary existing tour → read it via `can_view_tour`" bypass. Regression
    test: `supabase/tests/create_tour_with_membership.sql` (`npm run db:test:create-tour`).
- **Delete dequeue** (`src/lib/offline/dequeue.ts`): deleting a stop/tour whose create is still
  queued drops the paused create; idempotent upsert/delete replay is the safety net.
- **Pending-sync indicator** (§4.6): `src/features/offline/PendingSyncBar.tsx` +
  `useOfflineSyncStatus` (subtle top pill; Offline/Syncing/Retry), mounted in `app/(app)/_layout.tsx`.
- Tests: tours/shows optimistic patches, dequeue matcher, sync-status deriver (106 tests pass).

**Behavioral change (reported):** create/update/delete screens now **navigate immediately** after
firing the mutation instead of `await`ing it. Offline, TanStack *pauses* a mutation and its promise
wouldn't resolve until reconnect, so awaiting would block navigation. Hooks expose `submit()`
(fire-and-forget; creates return the client id for navigation); optimistic update + rollback keep
the UI correct, and failures surface via the pending-sync indicator rather than an inline alert.

Maps each change to concrete **files**, **dependencies**, and **tests**, in incremental
stages. Approach is fixed: TanStack Query offline mutations · `onlineManager` + NetInfo ·
client-generated UUIDs · defer geocoding to sync · no custom sync engine · subtle global
pending-sync indicator · explicit offline deletes.

> Repo rule (`AGENTS.md`): before writing code, verify the exact Expo 57 APIs (NetInfo/UUID
> source, `expo install` versions) against https://docs.expo.dev/versions/v57.0.0/. This
> checklist names the intended packages; pin versions via `expo install` at implementation.

---

## 0. Scope

**In scope:** create / update / delete of **tours**, **shows**, **off days** offline, with
optimistic UI, durable queue, idempotent replay, deferred geocoding, and a subtle sync
indicator.

**Out of scope (stay online-only, documented):**
- **AI import** (`useParseTour` / `useCreateImportedTour`, `src/features/tours/import.ts`) — the
  parse + geocode steps require network, so import *preparation* can't run offline regardless.
  **Stage 2.5 (F1)** still makes the *commit* atomic + idempotent via a transactional bulk RPC; the
  action stays online-only but can no longer leave a partial tour.
- **Join-by-discovery** (`useJoinTourById` from `AddTourScreen`) — discovery needs a live catalog
  read. `useJoinTour`/`useLeaveTour` on an already-cached tour *could* be queued later (Stage 3
  stretch), but are not Stage 1/2 commitments.
- Full local replica / "download all for offline" (see proposal §2.1).
- **Deferred review findings F3–F5** (replay ordering for dependent batches, stale connection-gated
  cache, offline membership mutations) — reviewed and intentionally postponed; **not scheduled** for
  Stage 2.5 or Stage 3. Rationale + revisit triggers live in the design doc (§9.1).

**Guiding invariants:**
- Every insert carries a **client-generated UUID**; replay is idempotent (`upsert onConflict id`
  / idempotent `delete by id`).
- Geocoding stays on the write path but runs **at sync time** inside the `mutationFn`.
- Offline is the *normal* case, surfaced by a **subtle** indicator, never a blocking error.

---

## 1. Dependencies

| Package | Why | Notes |
|---|---|---|
| `@react-native-community/netinfo` | feed `onlineManager` | `expo install` for the SDK-57-compatible version |
| UUID source — `expo-crypto` (`randomUUID()`) | client-generated ids | Prefer `expo-crypto` (already an Expo pkg family); verify `randomUUID` in v57 docs. Fallback: `uuid` + `react-native-get-random-values` polyfill |

No new native config expected beyond autolinking; confirm a dev client / prebuild is fine with
NetInfo at implementation.

---

## 2. Infrastructure (Stage 1 foundation)

| Change | File(s) |
|---|---|
| Wire `onlineManager` to NetInfo (module with a single side-effect init) | new `src/lib/offline/onlineManager.ts`; import once from `app/_layout.tsx` |
| Resume paused mutations after hydration **and** on reconnect, **after** session refresh | `app/_layout.tsx` (`PersistQueryClientProvider` `onSuccess` → `queryClient.resumePausedMutations()`); coordinate with `AuthContext` session readiness |
| Ensure paused mutations are persisted | `src/lib/queryClient.ts` / `app/_layout.tsx` `persistOptions` — confirm default mutation dehydration persists paused mutations; add `dehydrateOptions.shouldDehydrateMutation` only if needed |
| Central registry of `setMutationDefaults` (stable keys → `mutationFn`) so rehydrated mutations know how to run after cold start | new `src/lib/offline/mutationDefaults.ts`, invoked at startup (needs access to `session`; likely called from a provider once authed) |
| Stable mutation keys (create/update/delete × show/offday/tour) | extend `src/lib/queryKeys.ts` with a `mutations` section (e.g. `mutationKeys.shows.create`), single source |
| Small UUID helper | new `src/lib/uuid.ts` wrapping `expo-crypto` `randomUUID()` |

**Tests (Stage 1):**
- Unit: `onlineManager` listener maps NetInfo `isConnected` → online/offline (mock NetInfo).
- Unit: `src/lib/uuid.ts` returns a v4-shaped UUID.
- Unit: mutation-key factory shape (like existing `queryKeys` usage).

---

## 3. Pilot one mutation end-to-end (Stage 1)

Pilot = **create off day** (lowest risk; single row, optional geocode).

| Change | File(s) |
|---|---|
| `createOffDay` accepts a client `id`; insert via `upsert(row, { onConflict: 'id' })` | `src/features/shows/api.ts` (`CreateOffDayInput` + `createOffDay`) |
| `useCreateOffDay`: add `mutationKey`, generate `id`, `onMutate` optimistic insert into `queryKeys.shows.list(tourId)`, `onError` rollback, `onSettled` invalidate; register default via `setMutationDefaults` | `src/features/shows/queries.ts` + `src/lib/offline/mutationDefaults.ts` |
| Optimistic cache patch helper (pure) for inserting/removing a `TourStop` in a stops list | new `src/features/shows/optimistic.ts` (pure, unit-tested) |
| Geocoding stays in `mutationFn` (runs at sync) — no change to `resolveOffLocation`; confirm it tolerates being called at replay time | `src/features/shows/api.ts` (verify only) |

**Validate:** airplane-mode create → row appears instantly → survives app restart → reconnect →
row syncs once, no duplicate. Then confirm country/pin resolve post-sync.

**Tests (Stage 1 pilot):**
- Unit: `optimistic.ts` insert/remove/rollback patch functions.
- Unit: create `mutationFn` calls geocode-then-`upsert` with the supplied id (mock supabase + mapbox).

---

## 4. Roll out remaining mutations (Stage 2)

Apply the same pattern (client UUID + `mutationKey` + `setMutationDefaults` + optimistic
`onMutate`/rollback + deferred geocode) to:

| Mutation | Hook (file) | API (file) | Optimistic target caches |
|---|---|---|---|
| create show | `useCreateShow` (`shows/queries.ts`) | `createShow` (`shows/api.ts`) | `shows.list(tourId)` |
| update show | `useUpdateShow` | `updateShow` | `shows.list(tourId)`, `shows.detail(showId)` |
| update off day | `useUpdateOffDay` | `updateOffDay` | `shows.list(tourId)`, `shows.detail(stopId)` |
| **delete stop** (§4.7) | `useDeleteStop` | `deleteStop` (already idempotent) | remove from `shows.list(tourId)`; cancel queued create if unsynced |
| create tour | `useCreateTour` | `createTour` → **new transactional RPC** `create_tour_with_membership(...)` (inserts `tours` + `tour_members` in one transaction, idempotent on client ids) | `tours.all` |
| update tour | `useUpdateTour` | `updateTour` + `updateMyRole` | `tours.all`, `tours.detail`, `tours.membership` |
| **delete tour** (§4.7) | `useDeleteTour` | `deleteTour` | optimistic purge of `shows.list`, `tours.members/membership/detail` (cascade) |

**Delete specifics (per proposal §4.7):**
- Idempotent `delete by id`; optimistic removal + rollback.
- If a **paused create** for the same client UUID exists in the mutation cache, **dequeue it** and
  skip the delete (helper in `src/lib/offline/mutationDefaults.ts` or a small `offline/dequeue.ts`).
- Safety net: upsert-by-id + idempotent delete + in-order replay converge to "deleted" even without
  the dequeue.

**Idempotency note:** switch create inserts from `.insert(...).select('id').single()` to
`.upsert(row, { onConflict: 'id' }).select('id').single()`; `getOrCreateVenue` is already dedupe-
idempotent; `joinTour` already upserts.

**Tests (Stage 2):**
- Unit: optimistic patch + rollback for each cache shape (stops list, tours list, cascade purge).
- Unit: "dequeue paused create on delete" helper (pure over a mock mutation list).
- Unit: create-tour `mutationFn` inserts tour then member with shared ids (mock supabase).

---

## 4.5 Stage 2.5 — Architectural consistency: transactional import commit (F1) — ✅ complete (reviewed + approved)

Separate architectural-consistency task (**not** part of Stage 3). Closes **F1** from the post-Phase 4
architecture review: import is the last multi-row write that skipped the atomic-RPC treatment used by
`create_tour_with_membership`.

**Done:** migration `supabase/migrations/20260724000000_create_imported_tour.sql` (transactional,
idempotent, ownership-guarded `create_imported_tour`) · `createImportedTour` now resolves each stop
client-side via `resolveShowLocation` (exported from `shows/api.ts`) then commits with one RPC call ·
`useCreateImportedTour` set to `networkMode: 'always'` (online-only, no silent pause) · RPC type added
to `database.types.ts` · SQL harness `supabase/tests/create_imported_tour.sql` (`db:test:import`) +
unit test `src/features/tours/import.test.ts`.

**Post-review fix (F-A — stable client ids):** the tour id and every show id are now minted **once per
review session** (screen-held; tour id on parse, show ids per row) and passed as the mutation
variables — `createImportedTour` no longer generates ids internally. This mirrors the create-tour
pattern (`CreateTourVars`) and makes a retry / lost-ack re-tap re-send the same ids, so the idempotent
RPC converges to one tour + set of shows instead of duplicating. Covered by a dedicated
"re-invoking with the same variables re-sends identical stable ids" unit test. All jest + SQL
harnesses pass.

**Decision — Option A: online to prepare, atomic + idempotent to commit.** Parsing and venue/geocode
resolution stay online (they can't run offline anyway); the commit becomes a single transactional,
idempotent bulk RPC. Import remains online-only but can no longer leave a partial tour, and a
flaky-network commit is safe to retry.

**Server — new migration `supabase/migrations/<ts>_create_imported_tour.sql`:**
- `create_imported_tour(p_tour_id uuid, p_act_id uuid, p_act_name text, p_title text,
  p_start_date date, p_end_date date, p_visibility visibility, p_role text, p_stops jsonb)
  returns uuid`, `SECURITY DEFINER`, one transaction.
- Reuse the `create_tour_with_membership` **ownership guard**: if `p_tour_id` already exists and the
  caller isn't the creator → reject (`42501`); the original creator replaying is an idempotent no-op.
  Resolve the act server-side via `get_or_create_act` (same as the create path).
- Insert every stop from `p_stops` with its **client-supplied id** via
  `insert … on conflict (id) do nothing` → idempotent replay (converges to N shows, no dupes).
- Each `p_stops` element carries **pre-resolved fields only** (no geocoding in SQL): `id`, `date`,
  `kind` (`'show'`), `venue_id` (nullable), `city`, `country`, `latitude`, `longitude`, `address`.
  Venues are resolved client-side during review (`getOrCreateVenue`, online), so the RPC does pure
  inserts — no venue dedup in SQL.
- `grant execute … to authenticated`.

**Client:**
- `createImportedTour` (`src/features/tours/import.ts`): resolve each stop's venue/geocode in the
  review/confirm step (already does), generate a **client id per show**, and call the single
  `create_imported_tour` RPC with the stops array — replacing the current
  tour-RPC-then-loop-`createShow`.
- `useCreateImportedTour` (`src/features/tours/queries.ts`): stays a **normal (online-only)**
  mutation — NOT added to the offline `setMutationDefaults` registry and NOT persisted for cold-start
  replay (parse/geocode need network). The idempotent RPC + `retry` + the existing indicator cover a
  flaky commit. Gate the confirm action when offline with a clear message (no silent queue).
- `src/lib/database.types.ts`: add the `create_imported_tour` RPC signature.

**Verify before coding:** the `venues` dedup/unique constraint (so client-side `getOrCreateVenue`
fully settles `venue_id`s), that `shows` columns match the jsonb fields, and that `visibility`
defaults to `private`.

**Tests (Stage 2.5):**
- SQL regression `supabase/tests/create_imported_tour.sql` (add a `db:test:import` script): N stops →
  1 tour + 1 membership + N shows; replay is idempotent (still 1 tour, N shows, no dupes); a
  non-owner attaching to an existing tour id is rejected (mirrors the create-tour guard); a bad row
  aborts the whole transaction (all-or-nothing).
- Unit: `createImportedTour` builds the stops payload with client ids + resolved venue/geocode and
  makes a single `supabase.rpc('create_imported_tour', …)` call (mock supabase).

**Out of scope:** making import work fully offline (parse can't) — remains online-only.

---

## 5. Pending-sync indicator (Stage 2/3, per §4.6)

| Change | File(s) |
|---|---|
| Subtle global indicator component (hidden when nothing pending; Offline/Syncing/Retry states) | new `src/features/offline/PendingSyncBar.tsx` |
| Mount once inside the authed shell | `app/(app)/_layout.tsx` (or the tabs layout) |
| Derive count/state from `onlineManager` + `useMutationState`/`useIsMutating` filtered to offline mutation keys | within the component + a small `useOfflineSyncStatus` hook (`src/features/offline/useOfflineSyncStatus.ts`) |
| "Retry" action calls `resumePausedMutations()` | same hook/component |

**Tests:**
- Unit: `useOfflineSyncStatus` derives `{ pendingCount, state }` from mocked online flag + mutation
  states (offline+queued → "offline", online+replaying → "syncing", last replay errored → "error").

---

## 6. Offline hardening (Stage 3)

Focused on offline hardening only: **auth/replay**, **durability**, **UX**. (Import atomicity is
Stage 2.5, above; it is intentionally not part of Stage 3.)

### 6.1 Auth / replay

| Change | File(s) |
|---|---|
| `resumePausedMutations` runs only after a valid/refreshed session; on refresh failure, flip the indicator to "Couldn't sync · Retry" instead of silently erroring the queue | `app/_layout.tsx`, `src/features/auth/AuthContext.tsx`, `src/features/offline/*` |
| Defense-in-depth (F6): gate resume on a **session-identity match** (queued write's `userId` vs the current session user) so a queue can't replay under a different account; RLS (`created_by = auth.uid()`, tour-RPC owner checks) remains the backstop | `app/_layout.tsx`, `src/features/offline/*` |
| Offline sign-out: clear the query + mutation caches + persisted client **locally** even when `supabase.auth.signOut()` can't reach the server | `src/features/auth/AuthContext.tsx` |

### 6.2 Durability — persistence `maxAge` + `buster` (F2)

| Change | File(s) |
|---|---|
| Decouple persistence lifetime from read-freshness: keep `staleTime`/`gcTime` as the freshness controls; raise the persister **`maxAge` to ~30 days** (it only gates restore-vs-discard of the snapshot at hydration, **not** online read freshness) so offline-queued writes aren't silently dropped after 24h | `app/_layout.tsx` (`persistOptions.maxAge`), `src/lib/persister.ts`, `src/lib/queryClient.ts` (note the `gcTime` interaction) |
| Add a persistence **`buster`** tied to the app/schema version so a queued mutation can't replay against incompatible code after an app update (bumping it invalidates the persisted cache + queue) | `app/_layout.tsx` (`persistOptions.buster`) |
| (Stretch) If dropped pending writes are detected on a `buster`/`maxAge` invalidation, surface "unsynced changes were cleared by an update" rather than discarding silently | `src/features/offline/*` |

### 6.3 UX / indicator polish

| Change | File(s) |
|---|---|
| "Couldn't sync · Retry" state on auth-refresh failure (from 6.1) | `src/features/offline/PendingSyncBar.tsx`, `useOfflineSyncStatus` |
| Optional per-row "unsynced" marker on stops/tours still in the queue | stop/tour list rows + a small `useMutationState` selector |

**Tests (Stage 3):**
- Unit: "resume gated on valid session + identity match" logic (mock auth + mutation vars).
- Unit/config: persist options use the decoupled `maxAge` + a version `buster` (assert wiring).
- Manual airplane-mode script extended with a **>24h durability** check (write offline → reopen
  after the old 24h window → write still queued and syncs once).

---

## 7. Docs

- Short "how to make a mutation offline-capable" note (pattern: key + default + client id +
  optimistic patch + deferred geocode) appended to this checklist or a `CONTRIBUTING`-style doc, so
  new mutations follow it.

---

## Stage summary

1. **Stage 1 — Foundation + pilot:** deps, `onlineManager`, resume-on-reconnect, mutation-default
   registry, UUID helper, and **create off day** converted + validated offline→online. Minimal
   indicator acceptable here.
2. **Stage 2 — Rollout + deletes + indicator:** remaining show/off-day/tour create/update/delete
   (deletes per §4.7) + the subtle global indicator.
2.5. **Stage 2.5 — Import architectural consistency (F1): ✅ complete.** Transactional idempotent bulk
   RPC `create_imported_tour`; import stays online-to-prepare, atomic-to-commit — no more partial
   tours. Stable client ids minted once (F-A fix) so retries/re-taps converge to one tour.
3. **Stage 3 — Offline hardening:** auth/replay gating (session validity + identity, offline
   sign-out), **durability** (decoupled persister `maxAge` ~30d + version `buster` — F2), and UX
   polish (Couldn't-sync/Retry, optional per-row unsynced marker) + contributor docs.

## Risks / watch-items
- **Multi-row create tour**: use a **single transactional RPC** (`create_tour_with_membership`),
  not two PostgREST calls — otherwise a mid-replay failure leaves a partial record (tour with no
  membership). New migration: `supabase/migrations/<ts>_create_tour_with_membership.sql`
  (`SECURITY DEFINER`, `insert … on conflict (id) do nothing` on both rows). Stage 2 item.
- **Cold-start replay** needs `setMutationDefaults` registered *before* `resumePausedMutations`.
- **Persisted mutations in unencrypted AsyncStorage** — same data-at-rest tradeoff already noted in
  `persister.ts`; no secrets added.
- **Testing depth**: RN/jest can't easily exercise full persist+resume; cover the **pure**
  optimistic/dequeue/status helpers with unit tests and keep a written manual airplane-mode script.
- **Import commit atomicity (Stage 2.5 / F1)**: keep venue/geocode resolution client-side (online)
  so the `create_imported_tour` RPC stays pure inserts; verify the `venues` dedup constraint first.
- **Durability vs freshness (Stage 3 / F2)**: the persister `maxAge` only gates snapshot restore,
  not online read freshness — safe to raise to ~30d; pair it with a version `buster` so old queued
  mutations can't replay against changed code.
