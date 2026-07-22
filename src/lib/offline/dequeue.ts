import type { QueryClient } from '@tanstack/react-query';

// When a row is deleted while its own *create* is still queued offline (unsynced),
// the queued create is pointless — and replaying it would briefly resurrect the
// row before the delete runs. This helper finds and drops those paused creates.
//
// Safety net: even without dequeuing, replay still converges to "deleted" because
// creates are `upsert`-by-id and deletes are idempotent `delete by id`, replayed
// in order. This is purely an optimization + avoids UI flicker.

type MinimalMutation = {
  options: { mutationKey?: readonly unknown[] };
  state: { isPaused: boolean; variables?: unknown };
};

function keysEqual(a: readonly unknown[] | undefined, b: readonly unknown[]): boolean {
  return !!a && a.length === b.length && a.every((v, i) => v === b[i]);
}

function variablesId(variables: unknown): string | undefined {
  if (variables && typeof variables === 'object' && 'id' in variables) {
    const id = (variables as { id?: unknown }).id;
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
}

// Pure: returns the paused create mutations whose key matches one of `createKeys`
// and whose variables carry the given client `id`. Testable over a mock list.
export function findPausedCreatesForId(
  mutations: MinimalMutation[],
  createKeys: readonly (readonly unknown[])[],
  id: string,
): MinimalMutation[] {
  return mutations.filter(
    (m) =>
      m.state.isPaused &&
      variablesId(m.state.variables) === id &&
      createKeys.some((key) => keysEqual(m.options.mutationKey, key)),
  );
}

// Removes any paused create for `id` from the mutation cache. Returns true if one
// was found (i.e. the row was never synced).
export function cancelPausedCreatesForId(
  queryClient: QueryClient,
  createKeys: readonly (readonly unknown[])[],
  id: string,
): boolean {
  const cache = queryClient.getMutationCache();
  const matches = findPausedCreatesForId(cache.getAll() as unknown as MinimalMutation[], createKeys, id);
  for (const mutation of matches) {
    cache.remove(mutation as unknown as Parameters<typeof cache.remove>[0]);
  }
  return matches.length > 0;
}
