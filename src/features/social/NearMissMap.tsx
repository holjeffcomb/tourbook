import Mapbox, { Camera, LineLayer, MapView, PointAnnotation, ShapeSource } from '@rnmapbox/maps';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import type { NearMiss } from '@/features/stats/types';
import { env } from '@/lib/env';
import { colors, radius, spacing } from '@/theme';

if (env.mapboxToken) {
  Mapbox.setAccessToken(env.mapboxToken);
}

type Props = {
  nearMiss: NearMiss;
  height?: number;
};

type Coord = [number, number];

export function NearMissMap({ nearMiss, height = 200 }: Props) {
  if (!env.mapboxToken) return null;

  const a: Coord = [nearMiss.stopA.lng, nearMiss.stopA.lat];
  const b: Coord = [nearMiss.stopB.lng, nearMiss.stopB.lat];
  const line: FeatureCollection<LineString> = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [a, b] },
      } satisfies Feature<LineString>,
    ],
  };

  const lngs = [a[0], b[0]];
  const lats = [a[1], b[1]];
  const same = a[0] === b[0] && a[1] === b[1];

  return (
    <View style={[styles.container, { height }]}>
      <MapView style={styles.map} styleURL={Mapbox.StyleURL.Light} scaleBarEnabled={false}>
        {same ? (
          <Camera centerCoordinate={a} zoomLevel={11} animationDuration={0} />
        ) : (
          <Camera
            bounds={{
              ne: [Math.max(...lngs), Math.max(...lats)],
              sw: [Math.min(...lngs), Math.min(...lats)],
              paddingTop: 48,
              paddingBottom: 48,
              paddingLeft: 48,
              paddingRight: 48,
            }}
            animationDuration={0}
          />
        )}

        {!same && (
          <ShapeSource id="near-miss-line" shape={line}>
            <LineLayer
              id="near-miss-line-layer"
              style={{
                lineColor: colors.primary,
                lineWidth: 2,
                lineDasharray: [2, 2],
              }}
            />
          </ShapeSource>
        )}

        <PointAnnotation id="a" coordinate={a}>
          <View style={[styles.pin, styles.pinYou]}>
            <Text variant="caption" style={styles.pinText}>
              You
            </Text>
          </View>
        </PointAnnotation>
        <PointAnnotation id="b" coordinate={b}>
          <View style={[styles.pin, styles.pinThem]}>
            <Text variant="caption" style={styles.pinText}>
              Them
            </Text>
          </View>
        </PointAnnotation>
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  map: {
    flex: 1,
  },
  pin: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  pinYou: {
    backgroundColor: colors.primary,
  },
  pinThem: {
    backgroundColor: colors.text,
  },
  pinText: {
    color: '#fff',
  },
});
