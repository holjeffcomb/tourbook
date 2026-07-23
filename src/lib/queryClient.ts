import { QueryClient } from '@tanstack/react-query';

// Three independent knobs — kept distinct on purpose (design §4.9):
//   * staleTime — FRESHNESS: how long a cached read is trusted before an online
//     refetch. Governs online freshness only.
//   * gcTime — RETENTION (in memory): how long inactive data is kept so it can be
//     re-persisted and read offline. Not a freshness control.
//   * persister maxAge (see persistOptions.ts) — DURABILITY: how long a restored
//     on-disk snapshot (incl. paused/queued mutations) is trusted at hydration.
//
// Raising retention/durability does NOT make online reads staler — that's staleTime's
// job. We keep the read queue durable by lengthening gcTime + maxAge together (they
// must satisfy gcTime >= maxAge so retained data actually survives to be restored).
export const PERSIST_MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30 days

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000, // freshness: refetch after 30s stale (online only)
      gcTime: PERSIST_MAX_AGE, // retention: keep data ~30d so offline reads + the
      // persisted snapshot (with any queued writes) survive a long-closed app
    },
  },
});
