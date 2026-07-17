import { Linking, Platform } from 'react-native';

/**
 * Opens turn-by-turn directions to a coordinate in the platform's maps app
 * (Apple Maps on iOS, Google/geo on Android), falling back to the universal
 * Google Maps web URL if the native scheme can't be handled.
 */
export async function openDirections(
  latitude: number,
  longitude: number,
  label?: string,
): Promise<void> {
  const dest = `${latitude},${longitude}`;
  const query = label ? encodeURIComponent(label) : dest;
  const web = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;

  const primary = Platform.select({
    ios: `https://maps.apple.com/?daddr=${dest}&q=${query}`,
    android: `google.navigation:q=${dest}`,
    default: web,
  })!;

  try {
    await Linking.openURL(primary);
  } catch {
    await Linking.openURL(web).catch(() => {});
  }
}
