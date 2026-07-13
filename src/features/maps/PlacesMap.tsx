import {
  Camera,
  CircleLayer,
  HeatmapLayer,
  LineLayer,
  MapView,
  ShapeSource,
  SymbolLayer,
  type CircleLayerStyle,
  type HeatmapLayerStyle,
  type LineLayerStyle,
  type SymbolLayerStyle,
} from '@rnmapbox/maps';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import {
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentRef,
  type ReactElement,
} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { arcedPath, densifyPath } from '@/lib/geo';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { expr, isMapboxConfigured, mapStyleUrl, withAlpha } from './mapConfig';

// A single place the user has been. `weight` is a visit count (or any intensity
// metric) that drives point size and, once clustered, the blob total; the
// remaining fields are optional detail surfaced when a marker is tapped. This
// shape is the stable contract for the map — future data sources just produce it.
export type MapPlace = {
  id: string;
  latitude: number;
  longitude: number;
  weight?: number;
  label?: string;
  city?: string;
  tourCount?: number;
  lastVisit?: string | null;
};

// An ordered tour route: [lng, lat] pairs in travel order. Rendered as a line in
// the routes overlay, and densified into points so overlapping routes read hot.
export type RouteLine = {
  id: string;
  coordinates: [number, number][];
};

/** Which overlay the passport map is showing. */
export type PlacesMapMode = 'places' | 'routes';

// Everything tunable about the passport map lives here so future sessions can
// adjust the look (or expose UI controls) without touching render code.
export type PlacesMapConfig = {
  showPoints: boolean;
  /** Optional heat underlay (off by default; clustering carries the density read). */
  showHeatmap: boolean;
  /** Heatmap only renders once there are at least this many places. */
  heatmapMinPlaces: number;
  cluster: {
    enabled: boolean;
    /** Cluster catchment radius in pixels. */
    radius: number;
    /** Max zoom to keep clustering; above it, markers separate into points. */
    maxZoom: number;
  };
  /** Frame the camera to include every place on mount. */
  fitToPlaces: boolean;
  /** Camera used when there are no places (or fitToPlaces is off). */
  fallbackCamera: { centerCoordinate: [number, number]; zoomLevel: number };
  heatmap: {
    radius: number;
    intensity: number;
    opacity: number;
  };
  points: {
    minRadius: number;
    maxRadius: number;
    /** Weight that maps to maxRadius / peak heatmap intensity. */
    maxWeight: number;
    opacity: number;
    strokeWidth: number;
  };
  routes: {
    lineWidth: number;
    lineOpacity: number;
    /** Dot marker radius at each stop along the routes (0 hides them). */
    dotRadius: number;
    /** Curve segments as arcs (like flight paths) instead of straight lines. */
    arc: { enabled: boolean; curvature: number; segments: number };
    /** Overlay a density heat layer under the lines (overlaps read hotter). */
    showHeat: boolean;
    /** Spacing (miles) used to sample points along each route for the heat. */
    sampleMiles: number;
    heat: { radius: number; intensity: number; opacity: number };
  };
};

export const defaultPlacesMapConfig: PlacesMapConfig = {
  showPoints: true,
  showHeatmap: false,
  heatmapMinPlaces: 6,
  cluster: { enabled: true, radius: 50, maxZoom: 12 },
  fitToPlaces: true,
  // A roughly world/continent view centered on North America.
  fallbackCamera: { centerCoordinate: [-98.5, 39.8], zoomLevel: 2.5 },
  heatmap: { radius: 26, intensity: 1, opacity: 0.7 },
  points: { minRadius: 6, maxRadius: 18, maxWeight: 8, opacity: 0.9, strokeWidth: 1.5 },
  routes: {
    // Thin, translucent lines. Each tour is its own layer so overlapping routes
    // composite into higher opacity — a line-based heat effect.
    lineWidth: 0.75,
    lineOpacity: 0.5,
    dotRadius: 2,
    arc: { enabled: true, curvature: 0.2, segments: 24 },
    // Optional fuzzy density heat underlay; off by default (the lines carry it).
    showHeat: false,
    sampleMiles: 35,
    heat: { radius: 18, intensity: 1, opacity: 0.75 },
  },
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] };

function mergeConfig(base: PlacesMapConfig, override?: DeepPartial<PlacesMapConfig>): PlacesMapConfig {
  if (!override) return base;
  return {
    ...base,
    ...override,
    cluster: { ...base.cluster, ...override.cluster },
    fallbackCamera: { ...base.fallbackCamera, ...override.fallbackCamera },
    heatmap: { ...base.heatmap, ...override.heatmap },
    points: { ...base.points, ...override.points },
    routes: {
      ...base.routes,
      ...override.routes,
      arc: { ...base.routes.arc, ...override.routes?.arc },
      heat: { ...base.routes.heat, ...override.routes?.heat },
    },
  };
}

type Coord = [number, number];

function boundsFor(places: MapPlace[]) {
  const lngs = places.map((p) => p.longitude);
  const lats = places.map((p) => p.latitude);
  return {
    ne: [Math.max(...lngs), Math.max(...lats)] as Coord,
    sw: [Math.min(...lngs), Math.min(...lats)] as Coord,
    paddingTop: 56,
    paddingBottom: 56,
    paddingLeft: 56,
    paddingRight: 56,
  };
}

// Aggregates a cluster's contained visit counts so the blob label reads "how
// many visits are hiding under here", not just how many map points.
const CLUSTER_PROPERTIES = { totalVisits: ['+', ['get', 'weight']] };

function buildHeatmapStyle(cfg: PlacesMapConfig, colors: ThemeColors): HeatmapLayerStyle {
  return {
    heatmapWeight: expr(['interpolate', ['linear'], ['get', 'weight'], 0, 0, cfg.points.maxWeight, 1]),
    heatmapIntensity: cfg.heatmap.intensity,
    heatmapRadius: cfg.heatmap.radius,
    heatmapColor: expr([
      'interpolate',
      ['linear'],
      ['heatmap-density'],
      0,
      'rgba(0, 0, 0, 0)',
      0.2,
      withAlpha(colors.primary, 0.35),
      0.5,
      colors.primary,
      0.8,
      colors.accent,
      1,
      colors.warning,
    ]),
    heatmapOpacity: cfg.heatmap.opacity,
  };
}

// Cluster blob. Radius grows in steps with how many points it contains.
function buildClusterStyle(colors: ThemeColors): CircleLayerStyle {
  return {
    circleColor: colors.primary,
    circleRadius: expr(['step', ['get', 'point_count'], 16, 5, 20, 15, 26]),
    circleStrokeColor: colors.surface,
    circleStrokeWidth: 2,
    circleOpacity: 0.95,
  };
}

// A single place marker, sized by its own visit count.
function buildPointStyle(cfg: PlacesMapConfig, colors: ThemeColors): CircleLayerStyle {
  return {
    circleRadius: expr([
      'interpolate',
      ['linear'],
      ['get', 'weight'],
      1,
      cfg.points.minRadius,
      cfg.points.maxWeight,
      cfg.points.maxRadius,
    ]),
    circleColor: colors.primary,
    circleOpacity: cfg.points.opacity,
    circleStrokeColor: colors.surface,
    circleStrokeWidth: cfg.points.strokeWidth,
  };
}

// Count label shared by clusters (totalVisits) and repeat single places (weight).
function buildCountStyle(colors: ThemeColors, field: 'totalVisits' | 'weight'): SymbolLayerStyle {
  return {
    textField: expr(['to-string', ['get', field]]),
    textSize: 12,
    textColor: colors.onPrimary,
    textAllowOverlap: true,
    textIgnorePlacement: true,
  };
}

// A ring drawn around the currently selected marker.
function buildSelectedStyle(cfg: PlacesMapConfig, colors: ThemeColors): CircleLayerStyle {
  return {
    circleRadius: expr([
      'interpolate',
      ['linear'],
      ['get', 'weight'],
      1,
      cfg.points.minRadius + 4,
      cfg.points.maxWeight,
      cfg.points.maxRadius + 4,
    ]),
    circleColor: withAlpha(colors.accent, 0.001),
    circleStrokeColor: colors.accent,
    circleStrokeWidth: 3,
  };
}

// A translucent route line. Kept semi-transparent so the heat layer beneath
// shows through where routes stack up.
function buildRouteLineStyle(cfg: PlacesMapConfig, colors: ThemeColors): LineLayerStyle {
  return {
    lineColor: colors.accent,
    lineWidth: cfg.routes.lineWidth,
    lineOpacity: cfg.routes.lineOpacity,
    lineCap: 'round',
    lineJoin: 'round',
  };
}

// Small dot at each stop along the routes, for definition on the thin lines.
function buildRouteDotStyle(cfg: PlacesMapConfig, colors: ThemeColors): CircleLayerStyle {
  return {
    circleRadius: cfg.routes.dotRadius,
    circleColor: colors.accent,
    circleOpacity: 0.9,
    circleStrokeColor: colors.surface,
    circleStrokeWidth: 0.5,
  };
}

// Density heat from points sampled along the routes: the more routes overlap in
// an area, the denser the points and the hotter the color ramp.
function buildRouteHeatStyle(cfg: PlacesMapConfig, colors: ThemeColors): HeatmapLayerStyle {
  return {
    heatmapWeight: 1,
    heatmapIntensity: cfg.routes.heat.intensity,
    heatmapRadius: cfg.routes.heat.radius,
    heatmapColor: expr([
      'interpolate',
      ['linear'],
      ['heatmap-density'],
      0,
      'rgba(0, 0, 0, 0)',
      0.2,
      withAlpha(colors.primary, 0.35),
      0.5,
      colors.primary,
      0.8,
      colors.accent,
      1,
      colors.warning,
    ]),
    heatmapOpacity: cfg.routes.heat.opacity,
  };
}

function formatVisitDate(date: string | null | undefined): string | null {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

type Props = {
  places: MapPlace[];
  /** Tour routes for the "Routes" overlay. When empty, the toggle is hidden. */
  routes?: RouteLine[];
  height?: number;
  config?: DeepPartial<PlacesMapConfig>;
  /** Also fired (in addition to the built-in detail card) when a place is tapped. */
  onSelectPlace?: (id: string) => void;
};

// The Lifetime "passport" map. Nearby places collapse into a counted cluster
// blob when zoomed out; tapping a blob zooms in to break it apart, and tapping
// an individual marker reveals a detail card. Sizes scale with visit frequency.
// A customizable foundation — tweak `config`, or the style builders above.
export function PlacesMap({ places, routes = [], height = 320, config, onSelectPlace }: Props) {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const { scheme } = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Default to Routes; falls back to Places automatically when no routes exist.
  const [mode, setMode] = useState<PlacesMapMode>('routes');
  const cameraRef = useRef<ComponentRef<typeof Camera>>(null);
  const sourceRef = useRef<ComponentRef<typeof ShapeSource>>(null);

  const cfg = useMemo(() => mergeConfig(defaultPlacesMapConfig, config), [config]);

  const placesById = useMemo(() => {
    const map = new Map<string, MapPlace>();
    for (const p of places) map.set(p.id, p);
    return map;
  }, [places]);

  const featureCollection = useMemo<FeatureCollection<Point>>(
    () => ({
      type: 'FeatureCollection',
      features: places.map((p) => ({
        type: 'Feature',
        id: p.id,
        properties: { placeId: p.id, weight: p.weight ?? 1, label: p.label ?? '' },
        geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
      })),
    }),
    [places],
  );

  const initialCamera = useMemo<ComponentProps<typeof Camera>['defaultSettings']>(() => {
    if (!cfg.fitToPlaces || places.length === 0) {
      return {
        centerCoordinate: cfg.fallbackCamera.centerCoordinate,
        zoomLevel: cfg.fallbackCamera.zoomLevel,
      };
    }
    if (places.length === 1) {
      return { centerCoordinate: [places[0].longitude, places[0].latitude], zoomLevel: 9 };
    }
    return { bounds: boundsFor(places) };
  }, [cfg, places]);

  const routeLines = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: 'FeatureCollection',
      features: routes.map((r) => ({
        type: 'Feature',
        id: r.id,
        properties: { routeId: r.id },
        geometry: {
          type: 'LineString',
          coordinates: cfg.routes.arc.enabled
            ? arcedPath(r.coordinates, cfg.routes.arc.curvature, cfg.routes.arc.segments)
            : r.coordinates,
        },
      })),
    }),
    [routes, cfg.routes.arc],
  );

  const routeHeatPoints = useMemo<FeatureCollection<Point>>(() => {
    const features: Feature<Point>[] = [];
    for (const route of routes) {
      for (const [lng, lat] of densifyPath(route.coordinates, cfg.routes.sampleMiles)) {
        features.push({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [lng, lat] },
        });
      }
    }
    return { type: 'FeatureCollection', features };
  }, [routes, cfg.routes.sampleMiles]);

  const heatmapStyle = useMemo(() => buildHeatmapStyle(cfg, colors), [cfg, colors]);
  const clusterStyle = useMemo(() => buildClusterStyle(colors), [colors]);
  const pointStyle = useMemo(() => buildPointStyle(cfg, colors), [cfg, colors]);
  const selectedStyle = useMemo(() => buildSelectedStyle(cfg, colors), [cfg, colors]);
  const clusterCountStyle = useMemo(() => buildCountStyle(colors, 'totalVisits'), [colors]);
  const pointCountStyle = useMemo(() => buildCountStyle(colors, 'weight'), [colors]);
  const routeLineStyle = useMemo(() => buildRouteLineStyle(cfg, colors), [cfg, colors]);
  const routeDotStyle = useMemo(() => buildRouteDotStyle(cfg, colors), [cfg, colors]);
  const routeHeatStyle = useMemo(() => buildRouteHeatStyle(cfg, colors), [cfg, colors]);

  if (!isMapboxConfigured) {
    return (
      <View style={[styles.container, styles.placeholder, { height }]}>
        <Text variant="caption" color="textMuted" style={styles.placeholderText}>
          Map unavailable — add a Mapbox token to see everywhere you&apos;ve been.
        </Text>
      </View>
    );
  }

  const canShowRoutes = routes.length > 0;
  const routesMode = canShowRoutes && mode === 'routes';
  const showHeatmap = cfg.showHeatmap && places.length >= cfg.heatmapMinPlaces;
  const clustered = cfg.cluster.enabled;
  const selected = !routesMode && selectedId ? placesById.get(selectedId) : null;

  const switchMode = (next: PlacesMapMode) => {
    setMode(next);
    if (next === 'routes') setSelectedId(null);
  };

  const handlePress = async (event: { features: Feature[] }) => {
    const feature = event.features?.[0];
    if (!feature) return;
    const props = (feature.properties ?? {}) as { cluster?: boolean; placeId?: string };

    if (props.cluster) {
      try {
        const zoom = await sourceRef.current?.getClusterExpansionZoom(feature);
        const coordinates = (feature.geometry as Point).coordinates as Coord;
        cameraRef.current?.setCamera({
          centerCoordinate: coordinates,
          zoomLevel: (zoom ?? 10) + 0.5,
          animationDuration: 500,
        });
      } catch {
        // Expansion is best-effort; ignore if the cluster can't be resolved.
      }
      setSelectedId(null);
      return;
    }

    if (props.placeId != null) {
      setSelectedId(String(props.placeId));
      onSelectPlace?.(String(props.placeId));
    }
  };

  // Layers rendered inside the (optionally clustered) point source, bottom→top.
  const pointLayers: ReactElement[] = [];
  if (clustered) {
    pointLayers.push(
      <CircleLayer
        key="clusters"
        id="places-clusters"
        filter={expr(['has', 'point_count'])}
        style={clusterStyle}
      />,
      <SymbolLayer
        key="cluster-count"
        id="places-cluster-count"
        filter={expr(['has', 'point_count'])}
        style={clusterCountStyle}
      />,
    );
  }
  if (cfg.showPoints) {
    pointLayers.push(
      <CircleLayer
        key="points"
        id="places-points"
        filter={clustered ? expr(['!', ['has', 'point_count']]) : undefined}
        style={pointStyle}
      />,
    );
    if (selectedId) {
      pointLayers.push(
        <CircleLayer
          key="selected"
          id="places-selected"
          filter={expr(['==', ['get', 'placeId'], selectedId])}
          style={selectedStyle}
        />,
      );
    }
    pointLayers.push(
      <SymbolLayer
        key="point-count"
        id="places-point-count"
        filter={
          clustered
            ? expr(['all', ['!', ['has', 'point_count']], ['>', ['get', 'weight'], 1]])
            : expr(['>', ['get', 'weight'], 1])
        }
        style={pointCountStyle}
      />,
    );
  }

  // One layer per tour so overlapping routes stack their opacity (the heat read).
  const routeLayers: ReactElement[] = routes.map((route) => (
    <LineLayer
      key={`route-${route.id}`}
      id={`route-line-${route.id}`}
      filter={expr(['==', ['get', 'routeId'], route.id])}
      style={routeLineStyle}
    />
  ));

  return (
    <View style={styles.wrapper}>
      {canShowRoutes && (
        <View style={styles.toggle}>
          <ModeButton label="Places" active={!routesMode} onPress={() => switchMode('places')} />
          <ModeButton label="Routes" active={routesMode} onPress={() => switchMode('routes')} />
        </View>
      )}

      <View style={[styles.container, { height }]}>
        {/* Remount on theme change: switching styleURL live races layer updates
            against the style reload ("Layer … is not in style"). */}
        <MapView
          key={scheme}
          style={styles.map}
          styleURL={mapStyleUrl(scheme, 'minimal')}
          scaleBarEnabled={false}
        >
          <Camera ref={cameraRef} defaultSettings={initialCamera} animationDuration={0} />

        {/* Sources stay mounted across modes (remounting a clustered source can
            drop it); only their child layers toggle. */}
        {showHeatmap && (
          <ShapeSource id="places-heat" shape={featureCollection}>
            {routesMode
              ? []
              : [<HeatmapLayer key="places-heatmap" id="places-heatmap" style={heatmapStyle} />]}
          </ShapeSource>
        )}

        {places.length > 0 && (
          <ShapeSource
            ref={sourceRef}
            id="places"
            shape={featureCollection}
            cluster={clustered}
            clusterRadius={cfg.cluster.radius}
            clusterMaxZoomLevel={cfg.cluster.maxZoom}
            clusterProperties={CLUSTER_PROPERTIES}
            onPress={handlePress}
          >
            {routesMode ? [] : pointLayers}
          </ShapeSource>
        )}

        {canShowRoutes && cfg.routes.showHeat && routeHeatPoints.features.length > 0 && (
          <ShapeSource id="routes-heat" shape={routeHeatPoints}>
            {routesMode
              ? [<HeatmapLayer key="routes-heatmap" id="routes-heatmap" style={routeHeatStyle} />]
              : []}
          </ShapeSource>
        )}

        {canShowRoutes && (
          <ShapeSource id="routes" shape={routeLines}>
            {routesMode ? routeLayers : []}
          </ShapeSource>
        )}

        {canShowRoutes && cfg.routes.dotRadius > 0 && (
          <ShapeSource id="route-dots" shape={featureCollection}>
            {routesMode
              ? [<CircleLayer key="route-dots" id="route-dots-layer" style={routeDotStyle} />]
              : []}
          </ShapeSource>
        )}
      </MapView>

      {selected && (
        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <View style={styles.detailTitleWrap}>
              <Text variant="heading" numberOfLines={1}>
                {selected.label || selected.city || 'Place'}
              </Text>
              {!!selected.city && selected.label !== selected.city && (
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {selected.city}
                </Text>
              )}
            </View>
            <Pressable
              onPress={() => setSelectedId(null)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close place details"
            >
              <Text variant="body" color="textMuted">
                ✕
              </Text>
            </Pressable>
          </View>

          <View style={styles.detailStats}>
            <DetailStat
              value={String(selected.weight ?? 1)}
              label={`visit${(selected.weight ?? 1) === 1 ? '' : 's'}`}
            />
            {selected.tourCount != null && (
              <DetailStat
                value={String(selected.tourCount)}
                label={`tour${selected.tourCount === 1 ? '' : 's'}`}
              />
            )}
            {!!formatVisitDate(selected.lastVisit) && (
              <DetailStat value={formatVisitDate(selected.lastVisit)!} label="last visit" wide />
            )}
          </View>
        </View>
      )}
      </View>
    </View>
  );
}

function ModeButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.modeButton, active && styles.modeButtonActive]}
    >
      <Text variant="caption" color={active ? 'onPrimary' : 'textSecondary'}>
        {label}
      </Text>
    </Pressable>
  );
}

function DetailStat({ value, label, wide }: { value: string; label: string; wide?: boolean }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.detailStat, wide && styles.detailStatWide]}>
      <Text variant="body" style={styles.detailStatValue}>
        {value}
      </Text>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrapper: {
      gap: spacing.sm,
    },
    container: {
      borderRadius: radius.md,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    map: {
      flex: 1,
    },
    placeholder: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
      padding: spacing.lg,
    },
    placeholderText: {
      textAlign: 'center',
    },
    toggle: {
      alignSelf: 'center',
      flexDirection: 'row',
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 2,
    },
    modeButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.full,
    },
    modeButtonActive: {
      backgroundColor: colors.primary,
    },
    detailCard: {
      position: 'absolute',
      left: spacing.sm,
      right: spacing.sm,
      bottom: spacing.sm,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.sm,
    },
    detailHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    detailTitleWrap: {
      flex: 1,
      gap: 2,
    },
    detailStats: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.lg,
    },
    detailStat: {
      gap: 2,
    },
    detailStatWide: {
      flexShrink: 1,
    },
    detailStatValue: {
      fontWeight: '700',
    },
  });
