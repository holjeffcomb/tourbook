import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

// Without this wiring TanStack Query assumes it's always online in React Native,
// so mutations would never *pause* offline (and would just error). Feeding it
// NetInfo makes offline the normal, non-erroring case: mutations pause while
// offline and TanStack auto-resumes them the moment we come back online.

// Treat "connected but no internet" as offline. `isInternetReachable` is null
// while unknown (right after boot), so only trust it when it's explicitly false.
export function netInfoIsOnline(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

let initialized = false;

export function initOnlineManager(): void {
  if (initialized) return;
  initialized = true;
  onlineManager.setEventListener((setOnline) => {
    return NetInfo.addEventListener((state) => {
      setOnline(netInfoIsOnline(state));
    });
  });
}
