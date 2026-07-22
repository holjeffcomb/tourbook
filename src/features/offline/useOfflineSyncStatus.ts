import { onlineManager, useMutationState, useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import {
  deriveSyncStatus,
  type MutationStatusInfo,
  type SyncState,
} from '@/features/offline/syncStatus';
import { isOfflineMutationKey } from '@/lib/offline/offlineMutationKeys';
import { retryOfflineQueue } from '@/lib/offline/resumeQueue';
import { supabase } from '@/lib/supabase';

export type { SyncState } from '@/features/offline/syncStatus';

function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
    () => true,
  );
}

// Best-effort session recovery using the stored refresh token, run before a manual
// retry so an expired access token can't immediately re-fail the queue. Best-effort
// by design: if it can't refresh (offline, or the refresh token itself is dead) we
// still re-drive — those writes simply re-pause (offline) or re-error (dead session,
// which correctly keeps the "Couldn't sync" state).
async function recoverSession(): Promise<void> {
  try {
    await supabase.auth.refreshSession();
  } catch {
    // ignore — re-driving will surface any lasting failure via the error state
  }
}

// Derives the app-wide offline sync status from the live online flag and our
// offline-capable mutations. A failed replay (including an auth/token failure) shows
// up as the generic "Couldn't sync" error state. `retry` refreshes the session first
// (when online), then re-drives paused + previously-errored writes.
export function useOfflineSyncStatus(): {
  state: SyncState;
  pendingCount: number;
  retry: () => void;
} {
  const online = useOnline();
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const statuses = useMutationState({
    filters: { predicate: (mutation) => isOfflineMutationKey(mutation.options.mutationKey) },
    select: (mutation) => ({ status: mutation.state.status }) as MutationStatusInfo,
  });

  const retry = useCallback(() => {
    void (async () => {
      const userId = session?.user.id;
      if (!userId) return;
      if (online) await recoverSession();
      await retryOfflineQueue(queryClient, userId);
    })();
  }, [online, session, queryClient]);

  return { ...deriveSyncStatus({ online, statuses }), retry };
}
