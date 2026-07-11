import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

// Persists the TanStack Query cache to AsyncStorage so logged data is readable
// offline and across restarts. Note: AsyncStorage is unencrypted — this holds
// the same personal data already protected server-side by RLS, so it's an
// acceptable tradeoff for v1. Revisit (e.g. secure storage) if we store secrets.
export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'tourbook-query-cache',
  // Batch disk writes to keep the JS thread responsive during rapid updates.
  throttleTime: 1000,
});
