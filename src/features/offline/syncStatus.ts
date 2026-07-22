export type SyncState = 'idle' | 'offline' | 'syncing' | 'error';

// Snapshot of one mutation, reduced to what status derivation needs.
export type MutationStatusInfo = { status: 'idle' | 'pending' | 'success' | 'error' };

// Pure status derivation (unit-tested; intentionally free of React / RN / supabase
// imports so it stays hermetic). A paused (offline-queued) mutation still reports
// status 'pending' in TanStack, so `pending` covers both queued-offline and
// actively-replaying writes; `online` disambiguates the label. A settled failure
// (including an auth/token failure during replay) shows up here as `error`, which the
// indicator surfaces as the generic "Couldn't sync · Retry" state — no dedicated
// auth signal needed (see design §4.9; Retry refreshes the session before re-driving).
export function deriveSyncStatus(input: {
  online: boolean;
  statuses: MutationStatusInfo[];
}): { state: SyncState; pendingCount: number } {
  const pendingCount = input.statuses.filter((s) => s.status === 'pending').length;
  const hasError = input.statuses.some((s) => s.status === 'error');

  if (pendingCount > 0) return { state: input.online ? 'syncing' : 'offline', pendingCount };
  if (hasError) return { state: 'error', pendingCount: 0 };
  return { state: 'idle', pendingCount: 0 };
}
