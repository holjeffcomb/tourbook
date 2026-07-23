import * as Crypto from 'expo-crypto';

// Client-generated ids are the backbone of offline writes: the row is created
// locally with this id and later `upsert`ed by the same id, so a replayed
// mutation is idempotent (no duplicate rows) regardless of how many times it
// runs. `expo-crypto`'s randomUUID() is a cryptographically-random UUIDv4.
export function newId(): string {
  return Crypto.randomUUID();
}
