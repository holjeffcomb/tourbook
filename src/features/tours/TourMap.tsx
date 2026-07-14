import Mapbox, { Camera, LineLayer, MapView, PointAnnotation, ShapeSource } from '@rnmapbox/maps';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { env } from '@/lib/env';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useThemedStyles, useTheme } from '@/theme/ThemeProvider';

if (env.mapboxToken) {
  Mapbox.setAccessToken(env.mapboxToken);
}

export type RouteStop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  kind: 'show' | 'off';
  // False for a scheduled show whose venue isn't booked yet (placed by city).
  booked: boolean;
};

type Props = {
  stops: RouteStop[];
};

type Coord = [number, number];

function boundsFor(coordinates: Coord[]) {
  const lngs = coordinates.map((c) => c[0]);
  const lats = coordinates.map((c) => c[1]);
  return {
    ne: [Math.max(...lngs), Math.max(...lats)] as Coord,
    sw: [Math.min(...lngs), Math.min(...lats)] as Coord,
    paddingTop: 48,
    paddingBottom: 48,
    paddingLeft: 48,
    paddingRight: 48,
  };
}

function lineSegment(a: Coord, b: Coord): Feature<LineString> {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [a, b] } };
}

function collection(features: Feature<LineString>[]): FeatureCollection<LineString> {
  return { type: 'FeatureCollection', features };
}

// Renders the tour's located stops on a Mapbox map: solid numbered markers for
// shows, hollow markers for off days, and a route line in date order — solid
// between shows, dashed for travel/rest segments touching an off day. Returns
// null when Mapbox isn't configured or nothing has coordinates yet.
export function TourMap({ stops }: Props) {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const { scheme } = useTheme();
  if (!env.mapboxToken || stops.length === 0) return null;

  const coordinates = stops.map((s) => [s.longitude, s.latitude] as Coord);
  const single = coordinates.length === 1;
  const hasOffDays = stops.some((s) => s.kind === 'off');
  const hasTbd = stops.some((s) => s.kind === 'show' && !s.booked);

  // Split the route so segments touching an off day render dashed (travel/rest).
  const solid: Feature<LineString>[] = [];
  const dashed: Feature<LineString>[] = [];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const seg = lineSegment(coordinates[i], coordinates[i + 1]);
    if (stops[i].kind === 'off' || stops[i + 1].kind === 'off') dashed.push(seg);
    else solid.push(seg);
  }

  // Shows are numbered in order; off days are not numbered.
  let showNumber = 0;

  return (
    <View style={styles.container}>
      <MapView
        key={scheme}
        style={styles.map}
        styleURL={scheme === 'dark' ? Mapbox.StyleURL.Dark : Mapbox.StyleURL.Light}
        scaleBarEnabled={false}
      >
        {single ? (
          <Camera centerCoordinate={coordinates[0]} zoomLevel={9} animationDuration={0} />
        ) : (
          <Camera bounds={boundsFor(coordinates)} animationDuration={0} />
        )}

        {solid.length > 0 && (
          <ShapeSource id="tour-route-solid" shape={collection(solid)}>
            <LineLayer
              id="tour-route-solid-line"
              style={{ lineColor: colors.primary, lineWidth: 2, lineCap: 'round', lineJoin: 'round' }}
            />
          </ShapeSource>
        )}

        {dashed.length > 0 && (
          <ShapeSource id="tour-route-dashed" shape={collection(dashed)}>
            <LineLayer
              id="tour-route-dashed-line"
              style={{
                lineColor: colors.textMuted,
                lineWidth: 2,
                lineDasharray: [2, 2],
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        )}

        {stops.map((stop) => {
          const isOff = stop.kind === 'off';
          const isTbd = !isOff && !stop.booked;
          if (!isOff) showNumber += 1;
          const markerStyle = isOff
            ? styles.offMarker
            : isTbd
              ? styles.tbdMarker
              : styles.showMarker;
          return (
            <PointAnnotation
              key={stop.id}
              id={stop.id}
              coordinate={[stop.longitude, stop.latitude]}
            >
              <View style={[styles.marker, markerStyle]}>
                {!isOff && (
                  <Text variant="caption" style={[styles.markerLabel, isTbd && styles.tbdLabel]}>
                    {String(showNumber)}
                  </Text>
                )}
              </View>
            </PointAnnotation>
          );
        })}
      </MapView>

      {(hasOffDays || hasTbd) && (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.showMarker]} />
            <Text variant="caption" color="textMuted">
              Show
            </Text>
          </View>
          {hasTbd && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.tbdMarker]} />
              <Text variant="caption" color="textMuted">
                Venue TBD
              </Text>
            </View>
          )}
          {hasOffDays && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.offMarker]} />
              <Text variant="caption" color="textMuted">
                Off day
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  showMarker: {
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  tbdMarker: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  offMarker: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.textMuted,
  },
  markerLabel: {
    color: colors.surface,
    fontWeight: '700',
  },
  tbdLabel: {
    color: colors.primary,
  },
  legend: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  });
