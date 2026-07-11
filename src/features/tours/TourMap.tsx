import Mapbox, { Camera, LineLayer, MapView, PointAnnotation, ShapeSource } from '@rnmapbox/maps';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { env } from '@/lib/env';
import { colors, radius } from '@/theme';

if (env.mapboxToken) {
  Mapbox.setAccessToken(env.mapboxToken);
}

export type RouteStop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

type Props = {
  stops: RouteStop[];
};

function boundsFor(coordinates: [number, number][]) {
  const lngs = coordinates.map((c) => c[0]);
  const lats = coordinates.map((c) => c[1]);
  return {
    ne: [Math.max(...lngs), Math.max(...lats)] as [number, number],
    sw: [Math.min(...lngs), Math.min(...lats)] as [number, number],
    paddingTop: 48,
    paddingBottom: 48,
    paddingLeft: 48,
    paddingRight: 48,
  };
}

// Renders the tour's shows on a Mapbox map: a numbered marker per stop and a
// line connecting them in date order. Returns null when Mapbox isn't configured
// or no shows have coordinates yet.
export function TourMap({ stops }: Props) {
  if (!env.mapboxToken || stops.length === 0) return null;

  const coordinates = stops.map((s) => [s.longitude, s.latitude] as [number, number]);
  const single = coordinates.length === 1;

  return (
    <View style={styles.container}>
      <MapView style={styles.map} styleURL={Mapbox.StyleURL.Light} scaleBarEnabled={false}>
        {single ? (
          <Camera centerCoordinate={coordinates[0]} zoomLevel={9} animationDuration={0} />
        ) : (
          <Camera bounds={boundsFor(coordinates)} animationDuration={0} />
        )}

        {coordinates.length >= 2 && (
          <ShapeSource
            id="tour-route"
            shape={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }}
          >
            <LineLayer
              id="tour-route-line"
              style={{ lineColor: colors.primary, lineWidth: 2, lineCap: 'round', lineJoin: 'round' }}
            />
          </ShapeSource>
        )}

        {stops.map((stop, index) => (
          <PointAnnotation key={stop.id} id={stop.id} coordinate={[stop.longitude, stop.latitude]}>
            <View style={styles.marker}>
              <Text variant="caption" style={styles.markerLabel}>
                {index + 1}
              </Text>
            </View>
          </PointAnnotation>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 220,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  map: {
    flex: 1,
  },
  marker: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 4,
    borderRadius: 11,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerLabel: {
    color: colors.surface,
    fontWeight: '700',
  },
});
