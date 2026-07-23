import type { QueryClient } from '@tanstack/react-query';
import { isOfflineMutationKey } from '@/lib/offline/offlineMutationKeys';

// Identity-validated replay (design §4.9, finding F6).
//
// Every offline-capable mutation's variables carry the `userId` they were created
// under (see mutationDefaults). A paused (queued) write must only ever replay for
// the user who created it: on a shared device, signing out and back in as someone
// else must not flush the previous user's queue under the new session. RLS +
// owner checks in the RPCs are the server backstop (a misattributed write fails
// closed), but we prefer to never send it — so we drop mismatched queued mutations
// before resuming.

// Whether a queued mutation created by `mutationUserId` may replay for
// `currentUserId`. Fails closed: a paused write with no userId is treated as a
// mismatch (never replayed) rather than assumed to belong to the current user.
export function shouldReplayQueued(
  mutationUserId: string | undefined,
  currentUserId: string,
): boolean {
  return !!mutationUserId && mutationUserId === currentUserId;
}

// Minimal shape read from a queued mutation — keeps the partition helper trivially
// testable without constructing real TanStack Mutation instances.
export type QueuedMutationInfo = {
  isPaused: boolean;
  userId: string | undefined;
};

// Split queued mutations into those that may replay for the current user and those
// that must be discarded. Only paused mutations are considered (settled ones aren't
// part of the offline queue). Pure — unit-tested for matching/mismatched/mixed queues.
export function partitionQueuedMutations<T extends QueuedMutationInfo>(
  mutations: T[],
  currentUserId: string,
): { replay: T[]; discard: T[] } {
  const replay: T[] = [];
  const discard: T[] = [];
  for (const mutation of mutations) {
    if (!mutation.isPaused) continue;
    if (shouldReplayQueued(mutation.userId, currentUserId)) replay.push(mutation);
    else discard.push(mutation);
  }
  return { replay, discard };
}

// Remove any paused mutation that doesn't belong to `currentUserId`, then resume the
// rest. Use this instead of a bare `queryClient.resumePausedMutations()` so a queue
// can never flush under a different account. Used on cold start / reconnect.
export async function resumeQueuedMutations(
  queryClient: QueryClient,
  currentUserId: string,
): Promise<void> {
  const cache = queryClient.getMutationCache();
  for (const mutation of cache.getAll()) {
    if (!mutation.state.isPaused) continue;
    const userId = (mutation.state.variables as { userId?: string } | undefined)?.userId;
    if (!shouldReplayQueued(userId, currentUserId)) {
      cache.remove(mutation);
    }
  }
  await queryClient.resumePausedMutations();
}

// Retry flush behind the "Couldn't sync · Retry" indicator: like
// resumeQueuedMutations, but also RE-DRIVES offline writes that previously errored
// (e.g. an auth expiry during an earlier replay left them in the error state, where
// resumePausedMutations can't reach them). Re-execution is safe because both the
// optimistic patches (keyed by id) and the server writes (upsert / on-conflict) are
// idempotent. Mismatched-user queued writes are still discarded, never replayed.
//
// Guarantee = eventual convergence, NOT single-pass success. Re-driven mutations run
// concurrently and unordered, so a dependent chain (e.g. create-tour errored + a
// later edit-tour errored) may not fully drain in one Retry: the edit can race ahead
// of the create and re-error. Because every write is idempotent, repeating Retry
// converges to one correct final state once the parent lands. Cross-mutation ordering
// is intentionally not enforced here (a real batch/dependency mechanism is out of
// scope — see the deferred findings in offline-write-support.md).
export async function retryOfflineQueue(
  queryClient: QueryClient,
  currentUserId: string,
): Promise<void> {
  const cache = queryClient.getMutationCache();
  for (const mutation of cache.getAll()) {
    const userId = (mutation.state.variables as { userId?: string } | undefined)?.userId;
    const mine = shouldReplayQueued(userId, currentUserId);
    if (mutation.state.isPaused) {
      if (!mine) cache.remove(mutation);
      continue;
    }
    if (
      mine &&
      mutation.state.status === 'error' &&
      isOfflineMutationKey(mutation.options.mutationKey)
    ) {
      // Fire-and-forget: mutation state captures the outcome (a repeat failure just
      // re-enters the error state). Swallow the returned promise's rejection so a
      // re-drive that fails again doesn't surface as an unhandled rejection.
      mutation.execute(mutation.state.variables).catch(() => {});
    }
  }
  await queryClient.resumePausedMutations();
}
