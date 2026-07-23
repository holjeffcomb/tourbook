import { netInfoIsOnline } from '@/lib/offline/onlineManager';

describe('netInfoIsOnline', () => {
  it('is online when connected and internet is reachable', () => {
    expect(netInfoIsOnline({ isConnected: true, isInternetReachable: true })).toBe(true);
  });

  it('is online when connected and reachability is still unknown (null)', () => {
    expect(netInfoIsOnline({ isConnected: true, isInternetReachable: null })).toBe(true);
  });

  it('is offline when connected but internet is explicitly unreachable', () => {
    expect(netInfoIsOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
  });

  it('is offline when not connected', () => {
    expect(netInfoIsOnline({ isConnected: false, isInternetReachable: null })).toBe(false);
  });
});
