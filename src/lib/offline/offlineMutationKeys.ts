import { mutationKeys } from '@/lib/queryKeys';

// The mutation keys that participate in the offline queue (persisted + resumable).
// Shared by the sync indicator (to count/derive state) and the app-bootstrap
// MutationCache handlers (to scope auth-failure detection to queued writes only).
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

export function isOfflineMutationKey(key: readonly unknown[] | undefined): boolean {
  return !!key && OFFLINE_MUTATION_KEYS.includes(JSON.stringify(key));
}
