import { QueryClient } from '@tanstack/react-query';

// Cache is persisted to disk (see persister.ts), so keep unused data around long
// enough to survive app restarts; it must be >= the persister's maxAge.
export const CACHE_MAX_AGE = 1000 * 60 * 60 * 24; // 24 hours

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      gcTime: CACHE_MAX_AGE,
    },
  },
});
