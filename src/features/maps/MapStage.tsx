import {
  Camera,
  CircleLayer,
  LineLayer,
  MapView,
  PointAnnotation,
  ShapeSource,
  SymbolLayer,
  type CircleLayerStyle,
  type LineLayerStyle,
  type SymbolLayerStyle,
} from '@rnmapbox/maps';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactElement } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { arcedPath } from '@/lib/geo';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { expr, isMapboxConfigured, mapStyleUrl } from './mapConfig';
import {
  useActiveMapEntry,
  type Coord,
  type MapPlace,
  type MapScene,
  type SceneMarker,
} from './mapScene';

// Baked-in tuning for the clustered places / routes overlays (previously the
// Lifetime map's config). Kept as constants so the shared stage stays simple.
const CLUSTER = { radius: 50, maxZoom: 12 };
const POINTS = { minRadius: 6, maxRadius: 18, maxWeight: 8, opacity: 0.9, strokeWidth: 1.5 };
const ROUTE = { lineWidth: 0.75, lineOpacity: 0.5, dotRadius: 2, arcCurvature: 0.2, arcSegments: 24 };
const FALLBACK_CAMERA = { centerCoordinate: [-98.5, 39.8] as Coord, zoomLevel: 2.5 };
const CLUSTER_PROPERTIES = { totalVisits: ['+', ['get', 'weight']] };

// ---- Style builders (ported from the Lifetime map) ------------------------

function buildClusterStyle(colors: ThemeColors): CircleLayerStyle {
  return {
    circleColor: colors.primary,
    circleRadius: expr(['step', ['get', 'point_count'], 16, 5, 20, 15, 26]),
    circleStrokeColor: colors.surface,
    circleStrokeWidth: 2,
    circleOpacity: 0.95,
  };
}

function buildPointStyle(colors: ThemeColors): CircleLayerStyle {
  return {
    circleRadius: expr([
      'interpolate',
      ['linear'],
      ['get', 'weight'],
      1,
      POINTS.minRadius,
      POINTS.maxWeight,
      POINTS.maxRadius,
    ]),
    circleColor: colors.primary,
    circleOpacity: POINTS.opacity,
    circleStrokeColor: colors.surface,
    circleStrokeWidth: POINTS.strokeWidth,
  };
}

function buildCountStyle(colors: ThemeColors, field: 'totalVisits' | 'weight'): SymbolLayerStyle {
  return {
    textField: expr(['to-string', ['get', field]]),
    textSize: 12,
    textColor: colors.onPrimary,
    textAllowOverlap: true,
    textIgnorePlacement: true,
  };
}

function buildSelectedStyle(colors: ThemeColors): CircleLayerStyle {
  return {
    circleRadius: expr([
      'interpolate',
      ['linear'],
      ['get', 'weight'],
      1,
      POINTS.minRadius + 4,
      POINTS.maxWeight,
      POINTS.maxRadius + 4,
    ]),
    circleColor: 'rgba(0,0,0,0)',
    circleStrokeColor: colors.accent,
    circleStrokeWidth: 3,
  };
}

function buildRouteLineStyle(colors: ThemeColors): LineLayerStyle {
  return {
    lineColor: colors.accent,
    lineWidth: ROUTE.lineWidth,
    lineOpacity: ROUTE.lineOpacity,
    lineCap: 'round',
    lineJoin: 'round',
  };
}

function buildRouteDotStyle(colors: ThemeColors): CircleLayerStyle {
  return {
    circleRadius: ROUTE.dotRadius,
    circleColor: colors.accent,
    circleOpacity: 0.9,
    circleStrokeColor: colors.surface,
    circleStrokeWidth: 0.5,
  };
}

// ---- Geometry helpers -----------------------------------------------------

// Web-Mercator fit math. We compute the framing camera (center + zoom) ourselves
// instead of handing `bounds` to Mapbox: on the new architecture `setCamera({bounds})`
// only re-centers and keeps the current zoom (it never fits), so returning from a
// zoomed-in screen would strand the camera zoomed-in on the bounds' midpoint.
const TILE = 512;
const FIT_MAX_ZOOM = 16;

function lngToNormX(lng: number): number {
  return (lng + 180) / 360;
}

function latToNormY(latDeg: number): number {
  const lat = Math.max(Math.min(latDeg, 85.05112878), -85.05112878);
  const r = (lat * Math.PI) / 180;
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + r / 2)) / (2 * Math.PI);
}

function normYToLat(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}

/**
 * Camera (center + zoom) that fits [sw, ne] inside `width`×`height` px while
 * honouring per-side padding, so the framed content is centred in the *unpadded*
 * region (e.g. above the bottom sheet). Mirrors Mapbox's own bounds fitting.
 */
function fitCamera(
  ne: Coord,
  sw: Coord,
  width: number,
  height: number,
  pad: { top: number; right: number; bottom: number; left: number },
  maxZoom: number,
): { center: Coord; zoom: number } {
  const availW = Math.max(1, width - pad.left - pad.right);
  const availH = Math.max(1, height - pad.top - pad.bottom);

  let lngSpan = ne[0] - sw[0];
  if (lngSpan < 0) lngSpan += 360;
  const lngFraction = Math.max(1e-9, lngSpan / 360);
  const latFraction = Math.max(1e-9, latToNormY(sw[1]) - latToNormY(ne[1]));

  const zoomX = Math.log2(availW / (TILE * lngFraction));
  const zoomY = Math.log2(availH / (TILE * latFraction));
  let zoom = Math.min(zoomX, zoomY, maxZoom);
  if (!Number.isFinite(zoom)) zoom = 2;
  zoom = Math.max(0, zoom);

  const worldSize = TILE * 2 ** zoom;
  const bxNorm = (lngToNormX(sw[0]) + lngToNormX(ne[0])) / 2;
  const byNorm = (latToNormY(ne[1]) + latToNormY(sw[1])) / 2;
  // Shift the screen centre so the bounds sit centred within the padded region.
  const centerXNorm = bxNorm + (pad.right - pad.left) / 2 / worldSize;
  const centerYNorm = byNorm + (pad.bottom - pad.top) / 2 / worldSize;

  return {
    center: [centerXNorm * 360 - 180, normYToLat(centerYNorm)],
    zoom,
  };
}

function sceneCoords(scene: MapScene): Coord[] {
  if (scene.focus && scene.focus.length > 0) return scene.focus;
  const coords: Coord[] = [];
  for (const p of scene.places ?? []) coords.push([p.longitude, p.latitude]);
  for (const r of scene.routes ?? []) for (const c of r.coordinates) coords.push(c);
  for (const m of scene.markers ?? []) coords.push(m.coordinate);
  for (const g of scene.lines ?? []) for (const seg of g.segments) for (const c of seg) coords.push(c);
  return coords;
}

function formatVisitDate(date: string | null | undefined): string | null {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * The single, persistent map for the whole authenticated app. It renders on top
 * of the navigator (so it stays pan/zoom interactive) whatever the focused
 * screen registered via `useMapScreen`, and animates its camera between scenes
 * so the map reads as one continuous world that UI floats over. Renders nothing
 * until Mapbox is configured or while no map screen is focused.
 */
export function MapStage() {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const { scheme } = useTheme();
  const scene = useActiveMapEntry()?.scene ?? null;
  const bottomChrome = scene?.bottomChrome ?? 0;

  const cameraRef = useRef<ComponentRef<typeof Camera>>(null);
  const sourceRef = useRef<ComponentRef<typeof ShapeSource>>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  // Bumped every time the basemap style finishes (re)loading. Switching a
  // scene's `variant` (e.g. to Streets on the venue page) reloads the shared
  // map's style, which can drop an in-flight camera command — so we re-aim once
  // the new style is ready.
  const [styleEpoch, setStyleEpoch] = useState(0);

  const variant = scene?.variant ?? 'minimal';
  const places = useMemo(() => scene?.places ?? [], [scene]);
  const routes = useMemo(() => scene?.routes ?? [], [scene]);
  const markers = useMemo(() => scene?.markers ?? [], [scene]);
  const lineGroups = useMemo(() => scene?.lines ?? [], [scene]);
  const placesMode = scene?.placesMode ?? 'places';
  // Show routes for the Lifetime "routes" overlay, and for route-only scenes
  // (the tour-list maps) that carry routes but no clustered places.
  const showRoutes = routes.length > 0 && (placesMode === 'routes' || places.length === 0);
  const interactive = scene?.interactive ?? true;

  const insets = useMemo(
    () => ({
      top: scene?.contentInsets?.top ?? 0,
      bottom: scene?.contentInsets?.bottom ?? 0,
      left: scene?.contentInsets?.left ?? 0,
      right: scene?.contentInsets?.right ?? 0,
    }),
    [scene],
  );

  // Clear any place selection when the scene identity changes.
  useEffect(() => {
    setSelectedId(null);
  }, [scene?.key]);

  const placesById = useMemo(() => {
    const map = new Map<string, MapPlace>();
    for (const p of places) map.set(p.id, p);
    return map;
  }, [places]);

  const placeCollection = useMemo<FeatureCollection<Point>>(
    () => ({
      type: 'FeatureCollection',
      features: places.map((p) => ({
        type: 'Feature',
        id: p.id,
        properties: { placeId: p.id, weight: p.weight ?? 1 },
        geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
      })),
    }),
    [places],
  );

  const routeLines = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: 'FeatureCollection',
      features: routes.map((r) => ({
        type: 'Feature',
        id: r.id,
        properties: { routeId: r.id },
        geometry: {
          type: 'LineString',
          coordinates: arcedPath(r.coordinates, ROUTE.arcCurvature, ROUTE.arcSegments),
        },
      })),
    }),
    [routes],
  );

  // Visible stop dots for colour-coded routes (the list maps), mirroring the
  // Lifetime routes look: a thin translucent line with a dot at each stop.
  const routePoints = useMemo<FeatureCollection<Point>>(
    () => ({
      type: 'FeatureCollection',
      features: routes.flatMap((r) =>
        r.color
          ? r.coordinates.map((c, i) => ({
              type: 'Feature' as const,
              id: `${r.id}-pt-${i}`,
              properties: { color: r.color },
              geometry: { type: 'Point' as const, coordinates: c },
            }))
          : [],
      ),
    }),
    [routes],
  );

  // Camera framing: re-aim whenever the scene, its data, or its insets change.
  const framing = useMemo(() => {
    if (!scene) return null;
    const coords = showRoutes
      ? routes.flatMap((r) => r.coordinates)
      : sceneCoords(scene);
    if (coords.length === 0) return null;
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    return {
      ne: [Math.max(...lngs), Math.max(...lats)] as Coord,
      sw: [Math.min(...lngs), Math.min(...lats)] as Coord,
      single: coords.length === 1 ? coords[0] : null,
      zoom: scene.singleZoom ?? 9,
    };
  }, [scene, routes, showRoutes]);

  // Aim the camera at the active scene: instant on the first aim (app start),
  // animated afterwards so the map reads as one continuous world. We compute the
  // fit (center + zoom) ourselves rather than passing `bounds` to Mapbox, whose
  // bounds-fit only re-centers and keeps the current zoom on the new architecture.
  //
  // Crucially, we only re-aim for deliberate reasons — a new scene / frameKey,
  // the framing data first becoming available, the reserved insets moving (e.g.
  // the sheet), the map first getting a size, or a style reload. Plain data
  // changes within a scene (toggling the Lifetime year or routes/places) keep
  // the same frameKey and therefore leave the user's current pan/zoom alone.
  const frameKey = scene?.frameKey ?? scene?.key ?? '';
  const hasFraming = framing != null;
  const didInit = useRef(false);
  useEffect(() => {
    if (!framing || !mapReady) return;
    // A bounds fit needs the map's pixel size; a single point doesn't.
    if (!framing.single && (mapSize.width === 0 || mapSize.height === 0)) return;
    const pad = {
      top: 48 + insets.top,
      bottom: 48 + insets.bottom,
      left: 48 + insets.left,
      right: 48 + insets.right,
    };
    const { center, zoom } = framing.single
      ? { center: framing.single, zoom: framing.zoom }
      : fitCamera(framing.ne, framing.sw, mapSize.width, mapSize.height, pad, FIT_MAX_ZOOM);
    const duration = didInit.current ? 700 : 0;
    didInit.current = true;
    cameraRef.current?.setCamera({
      centerCoordinate: center,
      zoomLevel: zoom,
      animationDuration: duration,
    });
    // `framing` is intentionally read fresh but excluded from deps so pure data
    // changes don't re-aim; the listed deps are the deliberate re-frame reasons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    frameKey,
    hasFraming,
    mapReady,
    mapSize.width,
    mapSize.height,
    styleEpoch,
    insets.top,
    insets.bottom,
    insets.left,
    insets.right,
  ]);

  const clusterStyle = useMemo(() => buildClusterStyle(colors), [colors]);
  const pointStyle = useMemo(() => buildPointStyle(colors), [colors]);
  const selectedStyle = useMemo(() => buildSelectedStyle(colors), [colors]);
  const clusterCountStyle = useMemo(() => buildCountStyle(colors, 'totalVisits'), [colors]);
  const pointCountStyle = useMemo(() => buildCountStyle(colors, 'weight'), [colors]);
  const routeLineStyle = useMemo(() => buildRouteLineStyle(colors), [colors]);
  const routeDotStyle = useMemo(() => buildRouteDotStyle(colors), [colors]);
  const routePointStyle = useMemo<CircleLayerStyle>(
    () => ({
      circleRadius: 2.5,
      circleColor: expr(['get', 'color']),
      circleOpacity: 0.95,
      circleStrokeColor: colors.surface,
      circleStrokeWidth: 0.5,
    }),
    [colors],
  );

  // Tour stops (numbered shows / off days) render as data-driven layers declared
  // *after* the route lines so the numbers always sit above the route — a plain
  // PointAnnotation could be occluded by an overlapping line. Everything else
  // (You/Them, venue) stays a custom marker view.
  const stopMarkers = useMemo(
    () => markers.filter((m) => m.kind === 'show' || m.kind === 'off' || m.kind === 'tbd'),
    [markers],
  );
  const pinMarkers = useMemo(
    () => markers.filter((m) => m.kind === 'you' || m.kind === 'them' || m.kind === 'venue'),
    [markers],
  );
  const stopCollection = useMemo<FeatureCollection<Point>>(
    () => ({
      type: 'FeatureCollection',
      features: stopMarkers.map((m) => ({
        type: 'Feature',
        id: m.id,
        properties: { kind: m.kind, label: m.label ?? '', stopId: m.id },
        geometry: { type: 'Point', coordinates: m.coordinate },
      })),
    }),
    [stopMarkers],
  );
  const stopDotStyle = useMemo<CircleLayerStyle>(
    () => ({
      circleRadius: 11,
      circleColor: expr([
        'match',
        ['get', 'kind'],
        'show',
        colors.primary,
        'tbd',
        colors.surface,
        'off',
        colors.surface,
        colors.primary,
      ]),
      circleStrokeWidth: 2,
      circleStrokeColor: expr([
        'match',
        ['get', 'kind'],
        'show',
        colors.surface,
        'tbd',
        colors.primary,
        'off',
        colors.textMuted,
        colors.surface,
      ]),
    }),
    [colors],
  );
  const stopLabelStyle = useMemo<SymbolLayerStyle>(
    () => ({
      textField: expr(['get', 'label']),
      textSize: 12,
      textColor: expr(['match', ['get', 'kind'], 'tbd', colors.primary, colors.onPrimary]),
      // Halo in the circle's own colour keeps the number crisp over the route line.
      textHaloColor: expr(['match', ['get', 'kind'], 'show', colors.primary, colors.surface]),
      textHaloWidth: 1.2,
      textAllowOverlap: true,
      textIgnorePlacement: true,
    }),
    [colors],
  );

  if (!isMapboxConfigured) return null;

  // With no focused map screen we keep the map *mounted* (so it never reloads /
  // flashes when returning to a map screen) but hidden and non-interactive, so
  // the opaque navigator screen underneath shows through and stays tappable.
  const hidden = !scene;

  const selected = !showRoutes && selectedId ? placesById.get(selectedId) : null;

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
        // best-effort
      }
      setSelectedId(null);
      return;
    }
    if (props.placeId != null) {
      setSelectedId(String(props.placeId));
      scene?.onSelectPlace?.(String(props.placeId));
    }
  };

  const handleStopPress = (event: { features: Feature[] }) => {
    const feature = event.features?.[0];
    if (!feature) return;
    const props = (feature.properties ?? {}) as { stopId?: string };
    const stopId = props.stopId ?? (feature.id != null ? String(feature.id) : undefined);
    if (stopId != null) scene?.onSelectStop?.(String(stopId));
  };

  const pointLayers: ReactElement[] = [
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
    <CircleLayer
      key="points"
      id="places-points"
      filter={expr(['!', ['has', 'point_count']])}
      style={pointStyle}
    />,
  ];
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
      filter={expr(['all', ['!', ['has', 'point_count']], ['>', ['get', 'weight'], 1]])}
      style={pointCountStyle}
    />,
  );

  return (
    <View
      style={[styles.root, { bottom: bottomChrome, opacity: hidden ? 0 : 1 }]}
      pointerEvents={!hidden && interactive ? 'auto' : 'none'}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setMapSize((prev) =>
          Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
            ? prev
            : { width, height },
        );
      }}
    >
      <MapView
        key={scheme}
        style={styles.map}
        styleURL={mapStyleUrl(scheme, variant)}
        scaleBarEnabled={false}
        compassEnabled={false}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        onDidFinishLoadingMap={() => setMapReady(true)}
        onDidFinishLoadingStyle={() => setStyleEpoch((n) => n + 1)}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: FALLBACK_CAMERA.centerCoordinate,
            zoomLevel: FALLBACK_CAMERA.zoomLevel,
          }}
          animationDuration={0}
        />

        {/* Explicit polylines: tour legs, near-miss connector, etc. */}
        {lineGroups.map((group) => {
          const shape: FeatureCollection<LineString> = {
            type: 'FeatureCollection',
            features: group.segments.map((seg, i) => ({
              type: 'Feature',
              id: `${group.id}-${i}`,
              properties: {},
              geometry: { type: 'LineString', coordinates: seg },
            })),
          };
          const dashed = group.style === 'dashed';
          return (
            <ShapeSource key={group.id} id={`line-${group.id}`} shape={shape}>
              <LineLayer
                id={`line-${group.id}-layer`}
                style={{
                  lineColor: colors[group.color ?? 'primary'],
                  lineWidth: group.width ?? 2,
                  lineCap: 'round',
                  lineJoin: 'round',
                  ...(dashed ? { lineDasharray: [2, 2] } : null),
                }}
              />
            </ShapeSource>
          );
        })}

        {/* Routes: colour-coded per tour on the list maps; a translucent "heat"
            layer per tour on the Lifetime map so overlapping routes read hotter. */}
        {routes.length > 0 && (
          <ShapeSource id="routes" shape={routeLines}>
            {showRoutes
              ? routes.map((route) => (
                  <LineLayer
                    key={`route-${route.id}`}
                    id={`route-line-${route.id}`}
                    filter={expr(['==', ['get', 'routeId'], route.id])}
                    style={
                      route.color
                        ? {
                            lineColor: route.color,
                            lineWidth: 1,
                            lineOpacity: 0.5,
                            lineCap: 'round',
                            lineJoin: 'round',
                          }
                        : routeLineStyle
                    }
                  />
                ))
              : []}
          </ShapeSource>
        )}

        {/* Dots at each stop for colour-coded routes. */}
        {showRoutes && routePoints.features.length > 0 && (
          <ShapeSource id="route-points" shape={routePoints}>
            <CircleLayer id="route-points-layer" style={routePointStyle} />
          </ShapeSource>
        )}

        {/* Lifetime clustered places overlay. */}
        {places.length > 0 && (
          <ShapeSource
            ref={sourceRef}
            id="places"
            shape={placeCollection}
            cluster
            clusterRadius={CLUSTER.radius}
            clusterMaxZoomLevel={CLUSTER.maxZoom}
            clusterProperties={CLUSTER_PROPERTIES}
            onPress={handlePress}
          >
            {showRoutes ? [] : pointLayers}
          </ShapeSource>
        )}

        {places.length > 0 && ROUTE.dotRadius > 0 && (
          <ShapeSource id="route-dots" shape={placeCollection}>
            {showRoutes
              ? [<CircleLayer key="route-dots" id="route-dots-layer" style={routeDotStyle} />]
              : []}
          </ShapeSource>
        )}

        {/* Numbered tour stops, layered above the route line. */}
        {stopMarkers.length > 0 && (
          <ShapeSource id="stops" shape={stopCollection} onPress={handleStopPress}>
            <CircleLayer id="stops-dots" style={stopDotStyle} />
            <SymbolLayer id="stops-labels" style={stopLabelStyle} />
          </ShapeSource>
        )}

        {/* You / Them / venue pins as themed marker views. */}
        {pinMarkers.map((marker) => (
          <PointAnnotation key={marker.id} id={marker.id} coordinate={marker.coordinate}>
            <MarkerView marker={marker} styles={styles} />
          </PointAnnotation>
        ))}
      </MapView>

      {selected && (
        <View style={[styles.detailCard, { bottom: insets.bottom + spacing.sm }]}>
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
              styles={styles}
            />
            {selected.tourCount != null && (
              <DetailStat
                value={String(selected.tourCount)}
                label={`tour${selected.tourCount === 1 ? '' : 's'}`}
                styles={styles}
              />
            )}
            {!!formatVisitDate(selected.lastVisit) && (
              <DetailStat value={formatVisitDate(selected.lastVisit)!} label="last visit" wide styles={styles} />
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function MarkerView({
  marker,
  styles,
}: {
  marker: SceneMarker;
  styles: ReturnType<typeof createStyles>;
}) {
  const { kind, label } = marker;
  if (kind === 'venue') {
    return (
      <View style={styles.venueMarkerOuter}>
        <View style={styles.venueMarkerInner} />
      </View>
    );
  }
  return (
    <View style={[styles.pin, kind === 'you' ? styles.pinYou : styles.pinThem]}>
      <Text variant="caption" style={styles.pinText}>
        {label ?? (kind === 'you' ? 'You' : 'Them')}
      </Text>
    </View>
  );
}

function DetailStat({
  value,
  label,
  wide,
  styles,
}: {
  value: string;
  label: string;
  wide?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
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
    root: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    map: {
      flex: 1,
    },
    detailCard: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.sm,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
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
    // Marker views
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
    venueMarkerOuter: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.onPrimary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.primary,
    },
    venueMarkerInner: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
  });
