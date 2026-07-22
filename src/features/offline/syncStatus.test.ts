import { deriveSyncStatus } from '@/features/offline/syncStatus';

describe('deriveSyncStatus', () => {
  it('is idle when there are no mutations', () => {
    expect(deriveSyncStatus({ online: true, statuses: [] })).toEqual({
      state: 'idle',
      pendingCount: 0,
    });
  });

  it('is "offline" when writes are pending and we are offline', () => {
    const result = deriveSyncStatus({
      online: false,
      statuses: [{ status: 'pending' }, { status: 'pending' }],
    });
    expect(result).toEqual({ state: 'offline', pendingCount: 2 });
  });

  it('is "syncing" when writes are pending and we are back online', () => {
    const result = deriveSyncStatus({ online: true, statuses: [{ status: 'pending' }] });
    expect(result).toEqual({ state: 'syncing', pendingCount: 1 });
  });

  it('is "error" when nothing is pending but a write failed', () => {
    const result = deriveSyncStatus({
      online: true,
      statuses: [{ status: 'success' }, { status: 'error' }],
    });
    expect(result).toEqual({ state: 'error', pendingCount: 0 });
  });

  it('prioritizes in-flight syncing over a prior error', () => {
    const result = deriveSyncStatus({
      online: true,
      statuses: [{ status: 'error' }, { status: 'pending' }],
    });
    expect(result.state).toBe('syncing');
  });
});
