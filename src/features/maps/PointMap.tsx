import { Camera, MapView, PointAnnotation } from '@rnmapbox/maps';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { isMapboxConfigured, mapStyleUrl, type MapStyleVariant } from './mapConfig';

type Props = {
  latitude?: number | null;
  longitude?: number | null;
  /** Optional caption shown over the map (e.g. venue name). */
  label?: string;
  height?: number;
  zoom?: number;
  /** 'streets' (default) shows nearby businesses/POIs around the pin. */
  variant?: MapStyleVariant;
};

// A compact map centered on a single place. Uses the streets basemap so nearby
// businesses and POIs are labelled automatically. Renders nothing when Mapbox
// isn't configured or the place has no coordinates yet.
export function PointMap({
  latitude,
  longitude,
  label,
  height = 200,
  zoom = 14,
  variant = 'streets',
}: Props) {
  const styles = useThemedStyles(createStyles);
  const { scheme } = useTheme();

  if (!isMapboxConfigured) return null;
  if (latitude == null || longitude == null) return null;

  const center: [number, number] = [longitude, latitude];

  return (
    <View style={[styles.container, { height }]}>
      <MapView style={styles.map} styleURL={mapStyleUrl(scheme, variant)} scaleBarEnabled={false}>
        <Camera centerCoordinate={center} zoomLevel={zoom} animationDuration={0} />
        <PointAnnotation id="place" coordinate={center}>
          <View style={styles.markerOuter}>
            <View style={styles.markerInner} />
          </View>
        </PointAnnotation>
      </MapView>

      {!!label && (
        <View style={styles.labelPill} pointerEvents="none">
          <View style={styles.labelDot} />
          <Text variant="caption" numberOfLines={1} style={styles.labelText}>
            {label}
          </Text>
        </View>
      )}
    </View>
  );
}

const MARKER_SIZE = 18;

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      borderRadius: radius.md,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    map: {
      flex: 1,
    },
    markerOuter: {
      width: MARKER_SIZE,
      height: MARKER_SIZE,
      borderRadius: MARKER_SIZE / 2,
      backgroundColor: colors.onPrimary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.primary,
    },
    markerInner: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    labelPill: {
      position: 'absolute',
      left: spacing.sm,
      bottom: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.background,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      maxWidth: '80%',
    },
    labelDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    labelText: {
      flexShrink: 1,
    },
  });
