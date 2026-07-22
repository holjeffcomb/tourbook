// Mock the persister so this config test doesn't pull in AsyncStorage.
jest.mock('@/lib/persister', () => ({
  asyncStoragePersister: {
    persistClient: jest.fn(),
    restoreClient: jest.fn(),
    removeClient: jest.fn(),
  },
}));

import { persistOptions, PERSIST_BUSTER } from './persistOptions';
import { PERSIST_MAX_AGE } from './queryClient';

const ONE_DAY = 1000 * 60 * 60 * 24;

describe('persistOptions', () => {
  it('decouples durability (maxAge) from the old 24h read window', () => {
    expect(PERSIST_MAX_AGE).toBe(ONE_DAY * 30);
    expect(persistOptions.maxAge).toBe(PERSIST_MAX_AGE);
    // The write queue must outlive a realistic offline gap, not the 24h read window.
    expect(persistOptions.maxAge).toBeGreaterThan(ONE_DAY);
  });

  it('sets a version buster so stale-shaped queued mutations are invalidated on upgrade', () => {
    expect(typeof PERSIST_BUSTER).toBe('string');
    expect(PERSIST_BUSTER.length).toBeGreaterThan(0);
    expect(persistOptions.buster).toBe(PERSIST_BUSTER);
  });
});
