import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { asyncStoragePersister } from '@/lib/persister';
import { PERSIST_MAX_AGE } from '@/lib/queryClient';

// Bump this when the shape of persisted cache data OR queued mutation variables
// changes in a backwards-incompatible way. `buster` is compared at hydration: a
// mismatch discards the entire persisted snapshot AND the offline mutation queue,
// so an old-shaped queued write can never replay against changed code (design
// §4.9, finding F8).
//
// IMPORTANT: this is a SCHEMA/mutation-shape version, NOT the app version. Tying it
// to every release would discard users' unsynced offline writes on routine updates.
// Only bump it when a queued mutation from an older build could no longer replay
// safely (e.g. a mutation variable was renamed, or an optimistic cache shape changed).
export const PERSIST_BUSTER = 'offline-v1';

// Extracted from the provider so the wiring (maxAge decoupled from read freshness,
// version buster present) is unit-testable. Consumed by PersistQueryClientProvider
// in app/_layout.tsx.
export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: asyncStoragePersister,
  // DURABILITY, not freshness: only gates restore-vs-discard of the on-disk snapshot
  // (incl. paused mutations) at hydration. ~30d so offline-queued writes aren't
  // silently dropped after a day. Online read freshness is governed by staleTime.
  maxAge: PERSIST_MAX_AGE,
  buster: PERSIST_BUSTER,
};
