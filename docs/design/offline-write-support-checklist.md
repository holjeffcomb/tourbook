# Offline Write Support — Implementation Checklist

Status: **Stages 1 & 2 implemented.** Stage 3 (auth/token-expiry hardening + optional per-row
markers + contributor docs) pending.
Source of truth: [`offline-write-support.md`](./offline-write-support.md) (approach approved).

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
  parse step requires network (Mapbox/AI); can't run offline regardless.
- **Join-by-discovery** (`useJoinTourById` from `AddTourScreen`) — discovery needs a live catalog
  read. `useJoinTour`/`useLeaveTour` on an already-cached tour *could* be queued later (Stage 3
  stretch), but are not Stage 1/2 commitments.
- Full local replica / "download all for offline" (see proposal §2.1).

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

## 6. Auth / token-expiry hardening (Stage 3)

| Change | File(s) |
|---|---|
| Ensure `resumePausedMutations` runs only after a valid/refreshed session; on refresh failure, flip indicator to "Couldn't sync · Retry" rather than silently erroring the queue | `app/_layout.tsx`, `src/features/auth/AuthContext.tsx`, `src/features/offline/*` |

**Tests:** unit around the "resume gated on session" logic (mock auth state).

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
3. **Stage 3 — Hardening:** token-expiry ordering, indicator Retry/error states, optional per-row
   unsynced marker, contributor docs.

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
