import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Coord } from '@/features/maps/mapScene';

/**
 * `idle` before we've asked, `requesting` while a permission/position request is
 * in flight, then a terminal state. `denied` means the user declined the OS
 * prompt; `unavailable` covers services being off or a fix failing.
 */
export type LocationStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

export type CurrentLocation = {
  /** [longitude, latitude] to match the map's coordinate convention. */
  coordinate: Coord;
  latitude: number;
  longitude: number;
};

export type UseCurrentLocation = {
  location: CurrentLocation | null;
  status: LocationStatus;
  /** Whether the OS said we can prompt again (false → must go to Settings). */
  canAskAgain: boolean;
  refresh: () => Promise<void>;
};

/**
 * One-shot foreground location with permission handling. Requests `When In Use`
 * access and reads a single balanced-accuracy fix — enough to frame the user
 * next to a venue without draining the battery on continuous updates. Pass
 * `enabled` false to hold off (e.g. when there's no active tour to frame).
 */
export function useCurrentLocation(enabled: boolean): UseCurrentLocation {
  const [location, setLocation] = useState<CurrentLocation | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [canAskAgain, setCanAskAgain] = useState(true);
  // Guards against overlapping requests (e.g. a manual refresh mid-request).
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus('requesting');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      setCanAskAgain(permission.canAskAgain);
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setStatus('denied');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = position.coords;
      setLocation({ coordinate: [longitude, latitude], latitude, longitude });
      setStatus('granted');
    } catch {
      // Services off, no fix, or the module isn't available in this build.
      setStatus('unavailable');
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (enabled && status === 'idle') void refresh();
  }, [enabled, status, refresh]);

  return { location, status, canAskAgain, refresh };
}
