import {
  Camera,
  CircleLayer,
  LineLayer,
  MapView,
  PointAnnotation,
  ShapeSource,
  StyleImport,
  SymbolLayer,
  type CircleLayerStyle,
  type LineLayerStyle,
  type SymbolLayerStyle,
} from '@rnmapbox/maps';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { arcedPath, trimmedOverviewFrame } from '@/lib/geo';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { expr, isMapboxConfigured, resolveMapStyle, type MapStyleVariant } from './mapConfig';
import {
  useActiveMapEntry,
  type Coord,
  type MapScene,
  type SceneMarker,
} from './mapScene';

// Baked-in tuning for the clustered places / routes overlays (previously the
// Lifetime map's config). Kept as constants so the shared stage stays simple.
const CLUSTER = { radius: 50, maxZoom: 12 };
const POINTS = {
  // Radius also scales with camera zoom (see buildPointStyle) so the map stays
  // calm when zoomed out and more tactile up close.
  minRadius: 6,
  maxRadius: 18,
  maxWeight: 8,
  opacity: 0.9,
  strokeWidth: 1.5,
  zoomOut: 3,
  zoomIn: 12,
  zoomOutScale: 0.45,
  zoomInScale: 1.15,
};
// Route dots grow with zoom; hairline far out, comfortably tappable up close.
const ROUTE = {
  lineWidth: 0.75,
  lineOpacity: 0.5,
  // Light cream + thin dark border on Standard basemaps. Slightly thicker than
  // Default so legs stay readable at continent zoom; still a hairline up close.
  vividCore: '#F3E2C0',
  vividLineWidth: 1.35,
  vividLineOpacity: 1,
  vividCasingExtra: 1.25,
  vividCasingOpacity: 0.9,
  vividCasing: '#1A1520',
  vividDotStroke: '#1A1520',
  dotRadiusOut: 2,
  dotRadiusIn: 6.5,
  zoomOut: 3,
  zoomIn: 12,
  arcCurvature: 0.2,
  arcSegments: 24,
};

/** Standard dusk/night/satellite — busy, colourful basemaps that need louder overlays. */
function isVividBasemap(variant: MapStyleVariant): boolean {
  return variant === 'dusk' || variant === 'night' || variant === 'satellite';
}
const PLACE_LABEL_MIN_ZOOM = 8.5;
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

/** Weight-based radius expression, scaled for a given zoom factor. */
function weightRadiusAtZoom(zoomScale: number, pad = 0): unknown[] {
  return [
    'interpolate',
    ['linear'],
    ['get', 'weight'],
    1,
    POINTS.minRadius * zoomScale + pad,
    POINTS.maxWeight,
    POINTS.maxRadius * zoomScale + pad,
  ];
}

function buildPointStyle(colors: ThemeColors): CircleLayerStyle {
  return {
    circleRadius: expr([
      'interpolate',
      ['linear'],
      ['zoom'],
      POINTS.zoomOut,
      weightRadiusAtZoom(POINTS.zoomOutScale),
      POINTS.zoomIn,
      weightRadiusAtZoom(POINTS.zoomInScale),
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
      ['zoom'],
      POINTS.zoomOut,
      weightRadiusAtZoom(POINTS.zoomOutScale, 3),
      POINTS.zoomIn,
      weightRadiusAtZoom(POINTS.zoomInScale, 4),
    ]),
    circleColor: 'rgba(0,0,0,0)',
    circleStrokeColor: colors.accent,
    circleStrokeWidth: 3,
  };
}

/**
 * One stable LineLayer for every route. Colour / width come from feature
 * properties so adding or removing tours only updates the GeoJSON source —
 * never mounts/unmounts per-route layers (which races Mapbox with
 * "Layer X is not in style").
 */
function buildRouteLineStyle(colors: ThemeColors, vivid: boolean): LineLayerStyle {
  return {
    lineColor: expr([
      'case',
      ['has', 'color'],
      ['get', 'color'],
      vivid ? ROUTE.vividCore : colors.accent,
    ]),
    lineWidth: expr([
      'case',
      ['has', 'color'],
      vivid ? ROUTE.vividLineWidth : 1,
      vivid ? ROUTE.vividLineWidth : ROUTE.lineWidth,
    ]),
    lineOpacity: expr([
      'case',
      ['has', 'color'],
      vivid ? 0.95 : 0.5,
      vivid ? ROUTE.vividLineOpacity : ROUTE.lineOpacity,
    ]),
    lineCap: 'round',
    lineJoin: 'round',
    ...(vivid ? { lineEmissiveStrength: 1 } : null),
  };
}

/** Thin dark border drawn *under* the cream core (middle slot vs top). */
function buildRouteCasingStyle(): LineLayerStyle {
  return {
    lineColor: ROUTE.vividCasing,
    lineWidth: ROUTE.vividLineWidth + ROUTE.vividCasingExtra,
    lineOpacity: ROUTE.vividCasingOpacity,
    lineCap: 'round',
    lineJoin: 'round',
    lineEmissiveStrength: 1,
  };
}

function buildRouteDotStyle(colors: ThemeColors, vivid: boolean): CircleLayerStyle {
  return {
    circleRadius: expr([
      'interpolate',
      ['linear'],
      ['zoom'],
      ROUTE.zoomOut,
      ROUTE.dotRadiusOut,
      ROUTE.zoomIn,
      ROUTE.dotRadiusIn,
    ]),
    circleColor: vivid ? ROUTE.vividCore : colors.accent,
    circleOpacity: vivid ? 1 : 0.9,
    circleStrokeColor: vivid ? ROUTE.vividDotStroke : colors.surface,
    circleStrokeWidth: vivid ? 1.25 : 1,
    ...(vivid ? { circleEmissiveStrength: 1 } : null),
  };
}

/** City / venue name that fades in as you zoom toward a place. */
function buildPlaceLabelStyle(colors: ThemeColors): SymbolLayerStyle {
  return {
    textField: expr(['get', 'title']),
    textSize: 11,
    textColor: colors.text,
    textHaloColor: colors.surface,
    textHaloWidth: 1.4,
    textOffset: [0, 1.35],
    textAnchor: 'top',
    textMaxWidth: 10,
    textOptional: true,
    textAllowOverlap: false,
    textIgnorePlacement: false,
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

/** Sparse samples along a polyline so densified routes don't dominate framing. */
function sampleRouteCoords(coords: Coord[], maxPoints = 48): Coord[] {
  if (coords.length <= maxPoints) return coords;
  const out: Coord[] = [];
  const step = (coords.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i += 1) {
    out.push(coords[Math.round(i * step)]!);
  }
  return out;
}

/**
 * Coordinates used for camera fitting. Prefer discrete place pins when present
 * (cleaner than densified polylines); otherwise sparsely sample route geometry.
 */
function framingCoords(
  scene: MapScene,
  routes: { coordinates: Coord[] }[],
  showRoutes: boolean,
): Coord[] {
  if (scene.focus && scene.focus.length > 0) return scene.focus;

  if (showRoutes) {
    if (scene.places && scene.places.length > 0) {
      return scene.places.map((p) => [p.longitude, p.latitude] as Coord);
    }
    return routes.flatMap((r) => sampleRouteCoords(r.coordinates));
  }
  if (scene.places && scene.places.length > 0) {
    return scene.places.map((p) => [p.longitude, p.latitude] as Coord);
  }
  return sceneCoords(scene);
}

/** Apply content-inset padding as a center shift at a given zoom. */
function padCenter(
  center: Coord,
  zoom: number,
  pad: { top: number; right: number; bottom: number; left: number },
): Coord {
  const worldSize = TILE * 2 ** zoom;
  const centerXNorm = lngToNormX(center[0]) + (pad.right - pad.left) / 2 / worldSize;
  const centerYNorm = latToNormY(center[1]) + (pad.bottom - pad.top) / 2 / worldSize;
  return [centerXNorm * 360 - 180, normYToLat(centerYNorm)];
}

// Switching between map pages (tabs / detail screens) uses a long flyTo so the
// world glides instead of snapping. In-page reframes keep each scene's own timing.
const PAGE_GLIDE = { durationMs: 2800, mode: 'flyTo' as const };

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
  // ShapeSource presses also bubble a MapView press — ignore that one so we
  // don't clear the pane we just opened.
  const ignoreNextMapPress = useRef(false);
  // Last known camera — restored after a basemap style reload so switching
  // Default/Outdoors/Satellite (or venue Streets) doesn't reset pan/zoom.
  const lastCameraRef = useRef<{ center: Coord; zoom: number } | null>(null);
  // While a style reload is in flight, ignore camera callbacks (they often
  // report a transient world view) so we restore the pre-switch camera.
  const freezeCameraTrackRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  // Bumped every time the basemap style finishes (re)loading.
  const [styleEpoch, setStyleEpoch] = useState(0);
  // Style identity that has actually finished loading. Custom layers only mount
  // when this matches the current request — avoids updateLayer races on reload.
  const [loadedStyleKey, setLoadedStyleKey] = useState<string | null>(null);

  const variant = scene?.variant ?? 'minimal';
  const resolvedStyle = useMemo(() => resolveMapStyle(scheme, variant), [scheme, variant]);
  const styleKey = `${scheme}:${resolvedStyle.url}`;
  const overlaysReady = loadedStyleKey === styleKey;
  // Freeze tracking only when the style *URL* changes (reload). Dusk ↔ Night
  // share Standard and only tweak StyleImport config, so the camera stays live.
  const prevStyleUrlRef = useRef(resolvedStyle.url);
  if (prevStyleUrlRef.current !== resolvedStyle.url) {
    prevStyleUrlRef.current = resolvedStyle.url;
    freezeCameraTrackRef.current = true;
  }
  // Keep a ref so the style-loaded callback always stamps the latest key.
  const requestedStyleKeyRef = useRef(styleKey);
  requestedStyleKeyRef.current = styleKey;
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

  const selectedId = scene?.selectedPlaceId ?? null;

  const placeCollection = useMemo<FeatureCollection<Point>>(
    () => ({
      type: 'FeatureCollection',
      features: places.map((p) => {
        const title = (p.city || p.label || '').trim();
        return {
          type: 'Feature' as const,
          id: p.id,
          properties: {
            placeId: p.id,
            weight: p.weight ?? 1,
            title,
            label: p.label ?? '',
            city: p.city ?? '',
          },
          geometry: { type: 'Point' as const, coordinates: [p.longitude, p.latitude] },
        };
      }),
    }),
    [places],
  );

  const routeLines = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: 'FeatureCollection',
      features: routes.map((r) => ({
        type: 'Feature',
        id: r.id,
        properties: {
          routeId: r.id,
          // Optional — absent colour falls back to the basemap default in style.
          ...(r.color ? { color: r.color } : null),
        },
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
    const coords = framingCoords(scene, routes, showRoutes);
    if (coords.length === 0) return null;
    if (coords.length === 1) {
      return {
        ne: coords[0],
        sw: coords[0],
        center: null as Coord | null,
        single: coords[0],
        zoom: scene.singleZoom ?? 9,
      };
    }
    if (scene.focusMode === 'trimmed') {
      const trimmed = trimmedOverviewFrame(coords);
      return {
        ne: trimmed.ne as Coord,
        sw: trimmed.sw as Coord,
        // Lock to the full-set center so US+Europe frames mid-ocean, not a cluster.
        center: trimmed.center as Coord,
        single: null as Coord | null,
        zoom: scene.singleZoom ?? 9,
      };
    }
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    return {
      ne: [Math.max(...lngs), Math.max(...lats)] as Coord,
      sw: [Math.min(...lngs), Math.min(...lats)] as Coord,
      center: null as Coord | null,
      single: null as Coord | null,
      zoom: scene.singleZoom ?? 9,
    };
  }, [scene, routes, showRoutes]);

  // Aim the camera at the active scene: instant on the first aim (app start),
  // animated afterwards so the map reads as one continuous world. We compute the
  // fit (center + zoom) ourselves rather than passing `bounds` to Mapbox, whose
  // bounds-fit only re-centers and keeps the current zoom on the new architecture.
  //
  // Re-aim for deliberate framing changes (new scene / frameKey). Also wait for
  // the sheet's reserved bottom inset on a new frameKey so routes aren't fitted
  // into the full screen and then left hidden under the pane — but ignore later
  // snap-driven inset changes so dragging the sheet doesn't reset pan/zoom.
  const frameKey = scene?.frameKey ?? scene?.key ?? '';
  const hasFraming = framing != null;
  const bottomInset = Math.round(insets.bottom);
  const didInit = useRef(false);
  const framedForRef = useRef<{ key: string; bottom: number } | null>(null);
  const framedSceneKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!framing || !mapReady) return;
    // A bounds fit needs the map's pixel size; a single point doesn't.
    if (!framing.single && (mapSize.width === 0 || mapSize.height === 0)) return;

    const prev = framedForRef.current;
    const isNewKey = !prev || prev.key !== frameKey;
    // MapScreenScaffold / Lifetime start at bottom=0 until layout measures the
    // sheet. Framing then would park the tour under the pane.
    if (isNewKey && bottomInset <= 0) return;
    // Same frameKey with a later snap change — leave the user's camera alone.
    if (!isNewKey && prev.bottom > 0 && prev.bottom !== bottomInset) return;

    const pad = {
      top: 48 + insets.top,
      bottom: 48 + bottomInset,
      left: 48 + insets.left,
      right: 48 + insets.right,
    };
    let center: Coord;
    let zoom: number;
    if (framing.single) {
      // Still honour sheet padding so a focused stop isn't buried under the pane.
      center = padCenter(framing.single, framing.zoom, pad);
      zoom = framing.zoom;
    } else {
      const fitted = fitCamera(
        framing.ne,
        framing.sw,
        mapSize.width,
        mapSize.height,
        pad,
        FIT_MAX_ZOOM,
      );
      zoom = fitted.zoom;
      center = framing.center ? padCenter(framing.center, zoom, pad) : fitted.center;
    }

    const sceneKey = scene?.key ?? '';
    const isPageSwitch =
      didInit.current &&
      framedSceneKeyRef.current != null &&
      framedSceneKeyRef.current !== sceneKey;

    let duration: number;
    let animationMode: 'flyTo' | 'easeTo' | 'linearTo' | 'moveTo';
    if (!didInit.current) {
      duration = 0;
      animationMode = 'moveTo';
    } else if (isPageSwitch) {
      duration = PAGE_GLIDE.durationMs;
      animationMode = PAGE_GLIDE.mode;
    } else {
      duration = scene?.focusDurationMs ?? 700;
      animationMode = scene?.focusAnimationMode ?? 'easeTo';
    }

    didInit.current = true;
    framedSceneKeyRef.current = sceneKey;
    framedForRef.current = { key: frameKey, bottom: bottomInset };
    lastCameraRef.current = { center, zoom };
    cameraRef.current?.setCamera({
      centerCoordinate: center,
      zoomLevel: zoom,
      animationDuration: duration,
      animationMode,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey, hasFraming, mapReady, mapSize.width, mapSize.height, bottomInset]);

  // After a style reload, put the camera back where the user left it.
  useEffect(() => {
    if (styleEpoch === 0 || !mapReady) return;
    const cam = lastCameraRef.current;
    if (cam) {
      cameraRef.current?.setCamera({
        centerCoordinate: cam.center,
        zoomLevel: cam.zoom,
        animationDuration: 0,
        animationMode: 'moveTo',
      });
    }
    freezeCameraTrackRef.current = false;
  }, [styleEpoch, mapReady]);

  const clusterStyle = useMemo(() => buildClusterStyle(colors), [colors]);
  const pointStyle = useMemo(() => buildPointStyle(colors), [colors]);
  const selectedStyle = useMemo(() => buildSelectedStyle(colors), [colors]);
  const clusterCountStyle = useMemo(() => buildCountStyle(colors, 'totalVisits'), [colors]);
  const pointCountStyle = useMemo(() => buildCountStyle(colors, 'weight'), [colors]);
  const placeLabelStyle = useMemo(() => buildPlaceLabelStyle(colors), [colors]);
  const vividRoutes = isVividBasemap(variant);
  const routeLineStyle = useMemo(() => buildRouteLineStyle(colors, vividRoutes), [colors, vividRoutes]);
  const routeCasingStyle = useMemo(() => buildRouteCasingStyle(), []);
  const routeDotStyle = useMemo(() => buildRouteDotStyle(colors, vividRoutes), [colors, vividRoutes]);
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

  const handlePress = async (event: { features: Feature[] }) => {
    const feature = event.features?.[0];
    if (!feature) return;
    ignoreNextMapPress.current = true;
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
      scene?.onSelectPlace?.(null);
      return;
    }
    if (props.placeId != null) {
      scene?.onSelectPlace?.(String(props.placeId));
    }
  };

  const handleStopPress = (event: { features: Feature[] }) => {
    const feature = event.features?.[0];
    if (!feature) return;
    ignoreNextMapPress.current = true;
    const props = (feature.properties ?? {}) as { stopId?: string };
    const stopId = props.stopId ?? (feature.id != null ? String(feature.id) : undefined);
    if (stopId != null) scene?.onSelectStop?.(String(stopId));
  };

  const handleMapBackgroundPress = () => {
    if (ignoreNextMapPress.current) {
      ignoreNextMapPress.current = false;
      return;
    }
    scene?.onPressMapBackground?.();
  };

  // Places mode: clusters + weighted points. Routes mode: tappable stop dots
  // along the tour lines (same place data, no clustering). On Standard styles,
  // cream strokes go in `top`; dark casings sit in `middle` underneath.
  const hasStandardBasemap = !!resolvedStyle.basemap;
  const overlaySlot = hasStandardBasemap ? ('top' as const) : undefined;
  const casingSlot = hasStandardBasemap ? ('middle' as const) : undefined;
  const pointLayers: ReactElement[] = showRoutes
    ? [
        <CircleLayer
          key="route-dots"
          id="places-route-dots"
          slot={overlaySlot}
          style={routeDotStyle}
        />,
      ]
    : [
        <CircleLayer
          key="clusters"
          id="places-clusters"
          slot={overlaySlot}
          filter={expr(['has', 'point_count'])}
          style={clusterStyle}
        />,
        <SymbolLayer
          key="cluster-count"
          id="places-cluster-count"
          slot={overlaySlot}
          filter={expr(['has', 'point_count'])}
          style={clusterCountStyle}
        />,
        <CircleLayer
          key="points"
          id="places-points"
          slot={overlaySlot}
          filter={expr(['!', ['has', 'point_count']])}
          style={pointStyle}
        />,
        <SymbolLayer
          key="point-count"
          id="places-point-count"
          slot={overlaySlot}
          filter={expr(['all', ['!', ['has', 'point_count']], ['>', ['get', 'weight'], 1]])}
          style={pointCountStyle}
        />,
      ];
  if (selectedId) {
    pointLayers.push(
      <CircleLayer
        key="selected"
        id="places-selected"
        slot={overlaySlot}
        filter={
          showRoutes
            ? expr(['==', ['get', 'placeId'], selectedId])
            : expr(['all', ['!', ['has', 'point_count']], ['==', ['get', 'placeId'], selectedId]])
        }
        style={selectedStyle}
      />,
    );
  }
  // Zoom-dependent city/venue labels — places mode only on unclustered points.
  pointLayers.push(
    <SymbolLayer
      key="place-labels"
      id="places-labels"
      slot={overlaySlot}
      filter={showRoutes ? undefined : expr(['!', ['has', 'point_count']])}
      minZoomLevel={PLACE_LABEL_MIN_ZOOM}
      style={placeLabelStyle}
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
        styleURL={resolvedStyle.url}
        scaleBarEnabled={false}
        compassEnabled={false}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        onPress={handleMapBackgroundPress}
        onCameraChanged={(state) => {
          if (freezeCameraTrackRef.current) return;
          const center = state.properties.center;
          const zoom = state.properties.zoom;
          if (
            Array.isArray(center) &&
            center.length >= 2 &&
            typeof center[0] === 'number' &&
            typeof center[1] === 'number' &&
            typeof zoom === 'number'
          ) {
            lastCameraRef.current = { center: [center[0], center[1]], zoom };
          }
        }}
        onDidFinishLoadingMap={() => setMapReady(true)}
        onDidFinishLoadingStyle={() => {
          setLoadedStyleKey(requestedStyleKeyRef.current);
          setStyleEpoch((n) => n + 1);
        }}
      >
        {resolvedStyle.basemap && (
          <StyleImport id="basemap" existing config={resolvedStyle.basemap} />
        )}
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: FALLBACK_CAMERA.centerCoordinate,
            zoomLevel: FALLBACK_CAMERA.zoomLevel,
          }}
          animationDuration={0}
        />

        {/* Wait for the style to finish loading before mounting any custom
            layers — prevents "Layer X is not in style" update races. */}
        {overlaysReady && (
          <>
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
                <ShapeSource key={`${group.id}-${styleEpoch}`} id={`line-${group.id}`} shape={shape}>
                  <LineLayer
                    id={`line-${group.id}-layer`}
                    slot={overlaySlot}
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

            {routes.length > 0 && showRoutes && vividRoutes && (
              <ShapeSource key={`route-casings-${styleEpoch}`} id="route-casings" shape={routeLines}>
                {/* Default (uncoloured) Lifetime routes only — tour-list colours skip casing. */}
                <LineLayer
                  id="route-casings-layer"
                  slot={casingSlot}
                  filter={expr(['!', ['has', 'color']])}
                  style={routeCasingStyle}
                />
              </ShapeSource>
            )}

            {routes.length > 0 && showRoutes && (
              <ShapeSource key={`routes-${styleEpoch}`} id="routes" shape={routeLines}>
                <LineLayer
                  id="route-lines"
                  slot={overlaySlot}
                  style={routeLineStyle}
                />
              </ShapeSource>
            )}

            {showRoutes && routePoints.features.length > 0 && (
              <ShapeSource key={`route-points-${styleEpoch}`} id="route-points" shape={routePoints}>
                <CircleLayer id="route-points-layer" slot={overlaySlot} style={routePointStyle} />
              </ShapeSource>
            )}

            {places.length > 0 && (
              <ShapeSource
                ref={sourceRef}
                key={`places-${showRoutes ? 'routes' : 'clustered'}-${styleEpoch}`}
                id="places"
                shape={placeCollection}
                cluster={!showRoutes}
                clusterRadius={CLUSTER.radius}
                clusterMaxZoomLevel={CLUSTER.maxZoom}
                clusterProperties={CLUSTER_PROPERTIES}
                onPress={handlePress}
              >
                {pointLayers}
              </ShapeSource>
            )}

            {stopMarkers.length > 0 && (
              <ShapeSource
                key={`stops-${styleEpoch}`}
                id="stops"
                shape={stopCollection}
                onPress={handleStopPress}
              >
                <CircleLayer id="stops-dots" slot={overlaySlot} style={stopDotStyle} />
                <SymbolLayer id="stops-labels" slot={overlaySlot} style={stopLabelStyle} />
              </ShapeSource>
            )}

            {pinMarkers.map((marker) => (
              <PointAnnotation
                key={marker.id}
                id={marker.id}
                coordinate={marker.coordinate}
                onSelected={() => scene?.onSelectMarker?.(marker)}
              >
                <MarkerView marker={marker} styles={styles} />
              </PointAnnotation>
            ))}
          </>
        )}
      </MapView>

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
