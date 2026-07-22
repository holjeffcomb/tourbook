# Design Proposal: Offline Write Support

**Status:** Approved (recommended approach) — implementation pending. Stage-by-stage plan in
[`offline-write-support-checklist.md`](./offline-write-support-checklist.md).
**Phase:** 4 (Future Planning)
**Author:** Architecture review follow-up

**Approved decisions:** TanStack Query offline mutations · `onlineManager` + NetInfo ·
client-generated UUIDs · defer geocoding until sync · no custom sync engine · a **subtle,
global pending-sync status indicator** (§4.6) · explicit **offline delete** handling (§4.7) ·
offline **reads are best-effort from cache**, not a guarantee of full data availability (§2.1).

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

## 5. Data & Schema Impact

- Minimal. Client-generated UUIDs work with existing `uuid primary key default
  gen_random_uuid()` columns (the default is simply overridden by the supplied id).
- Optionally add `updated_at`-based last-write-wins guards (most tables already have
  `updated_at` via `set_updated_at`).
- If we choose the flag-based geocoding approach: add `needs_geocode boolean` to `shows`
  (not needed for the recommended defer-to-sync approach).

## 6. Rollout / Migration

1. Add NetInfo + wire `onlineManager`. (No behavior change online.)
2. Convert one low-risk mutation (e.g. create off day) to: client UUID + optimistic update +
   `mutationFn` that geocodes-then-writes + `setMutationDefaults`. Validate offline→online.
3. Roll the pattern out to create/update/delete show and tour mutations (deletes per §4.7).
4. Add the subtle global pending-sync indicator (§4.6), driven by `onlineManager` + the
   mutation cache.
5. Document the pattern so new mutations follow it.

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

**Still open (not blocking Stage 1 of the checklist):**
- How long should paused mutations live before the indicator flips to "couldn't sync"? (Start
  with: never auto-drop; surface a Retry after a failed replay attempt.)
- Is last-write-wins acceptable, or do we want per-field merge for edits? (Default: LWW.)
- Should `join`/`leave`/AI-`import` be offline-capable, or stay online-only? (AI parse needs
  network regardless; see checklist scope.)

## 10. Recommendation

Adopt TanStack Query's built-in offline mutation support: wire `onlineManager` to NetInfo,
use **client-generated UUIDs + optimistic updates + `setMutationDefaults` + persisted,
resumable mutations**, and **defer geocoding to sync time** so Phase-3 write-path code is
reused unchanged. Pilot on one mutation, verify the offline→online round trip, then roll
out. Avoid building a custom sync engine or introducing global state.
