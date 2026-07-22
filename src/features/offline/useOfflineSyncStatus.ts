import { onlineManager, useMutationState, useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import { mutationKeys } from '@/lib/queryKeys';

export type SyncState = 'idle' | 'offline' | 'syncing' | 'error';

// Snapshot of one mutation, reduced to what status derivation needs.
export type MutationStatusInfo = { status: 'idle' | 'pending' | 'success' | 'error' };

// Pure status derivation (unit-tested). A paused (offline-queued) mutation still
// reports status 'pending' in TanStack, so `pending` covers both queued-offline
// and actively-replaying writes; `online` disambiguates the label.
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

const OFFLINE_MUTATION_KEYS: string[] = [
  mutationKeys.shows.create,
  mutationKeys.shows.update,
  mutationKeys.offDays.create,
  mutationKeys.offDays.update,
  mutationKeys.stops.delete,
  mutationKeys.tours.create,
  mutationKeys.tours.update,
  mutationKeys.tours.delete,
].map((key) => JSON.stringify(key));

function isOfflineMutationKey(key: readonly unknown[] | undefined): boolean {
  return !!key && OFFLINE_MUTATION_KEYS.includes(JSON.stringify(key));
}

function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
    () => true,
  );
}

// Derives the app-wide offline sync status from the live online flag and the state
// of our offline-capable mutations. Also exposes a `retry` that re-runs any paused
// (queued) mutations — used by the pending-sync indicator's Retry action.
export function useOfflineSyncStatus(): {
  state: SyncState;
  pendingCount: number;
  retry: () => void;
} {
  const online = useOnline();
  const queryClient = useQueryClient();

  const statuses = useMutationState({
    filters: { predicate: (mutation) => isOfflineMutationKey(mutation.options.mutationKey) },
    select: (mutation) => ({ status: mutation.state.status }) as MutationStatusInfo,
  });

  const retry = useCallback(() => {
    void queryClient.resumePausedMutations();
  }, [queryClient]);

  return { ...deriveSyncStatus({ online, statuses }), retry };
}
