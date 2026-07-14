import type { ConfigContext, ExpoConfig } from 'expo/config';

// Dynamic config layered on top of app.json. It injects the Mapbox native plugin
// with the *secret* download token from the environment (MAPBOX_DOWNLOAD_TOKEN),
// so the secret never lives in committed config. Set it in .env for local builds
// and as an EAS environment variable for cloud builds.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  plugins: [
    ...(config.plugins ?? []),
    // Registers the Ionicons font with the native project (integrates with expo-font).
    '@react-native-vector-icons/ionicons',
    [
      '@rnmapbox/maps',
      // No RNMapboxMapsVersion override: the package pins a matching native SDK.
      process.env.MAPBOX_DOWNLOAD_TOKEN
        ? { RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOAD_TOKEN }
        : {},
    ],
    // Mapbox's iOS pods require static frameworks under Expo's precompiled pipeline.
    ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
  ],
});
