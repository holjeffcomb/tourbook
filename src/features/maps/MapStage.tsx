import {
  Camera,
  CircleLayer,
  LineLayer,
  MapView,
  PointAnnotation,
  ShapeSource,
  StyleImport,
  SymbolLayer,
} from '@rnmapbox/maps';
import type { Feature, Point } from 'geojson';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { type ThemeColors } from '@/theme';
import { useColors, useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import {
  FALLBACK_CAMERA,
  FIT_MAX_ZOOM,
  PAGE_GLIDE,
  computeFraming,
  fitCamera,
  padCenter,
} from './mapCamera';
import { expr, isMapboxConfigured, resolveMapStyle } from './mapConfig';
import {
  buildLineGroupShape,
  buildPlaceCollection,
  buildRouteLines,
  buildRoutePoints,
  buildStopCollection,
} from './mapFeatures';
import {
  CLUSTER,
  CLUSTER_PROPERTIES,
  PLACE_LABEL_MIN_ZOOM,
  buildClusterStyle,
  buildCountStyle,
  buildPlaceLabelStyle,
  buildPointStyle,
  buildRouteCasingStyle,
  buildRouteDotStyle,
  buildRouteLineStyle,
  buildRoutePointStyle,
  buildSelectedStyle,
  buildStopDotStyle,
  buildStopLabelStyle,
  isVividBasemap,
} from './mapLayerStyles';
import { MarkerView } from './MapMarkerView';
import { useActiveMapEntry, type Coord } from './mapScene';
import { useAmbientCamera } from './useAmbientCamera';

// After the user touches the map, wait this long with no further touches before
// the ambient cinematic loop resumes.
const AMBIENT_RESUME_MS = 4500;

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
  const mapViewRef = useRef<ComponentRef<typeof MapView>>(null);
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

  // Ambient cinematic loop (Lifetime). Paused while the user is interacting with
  // the map or has a place selected, so pins stay put and tappable.
  const ambientPlan = scene?.ambient ?? null;
  const [interacting, setInteracting] = useState(false);
  const interactingRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumpInteract = useCallback(() => {
    if (!interactingRef.current) {
      interactingRef.current = true;
      setInteracting(true);
    }
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      interactingRef.current = false;
      setInteracting(false);
    }, AMBIENT_RESUME_MS);
  }, []);
  useEffect(() => () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
  }, []);

  const { snapshotUri, snapshotStyle, onSnapshotLoad } = useAmbientCamera({
    cameraRef,
    mapViewRef,
    plan: ambientPlan,
    paused: interacting || selectedId != null || !mapReady || !overlaysReady,
  });

  const placeCollection = useMemo(() => buildPlaceCollection(places), [places]);
  const routeLines = useMemo(() => buildRouteLines(routes), [routes]);
  const routePoints = useMemo(() => buildRoutePoints(routes), [routes]);

  // Camera framing: re-aim whenever the scene, its data, or its insets change.
  const framing = useMemo(
    () => (scene ? computeFraming(scene, routes, showRoutes) : null),
    [scene, routes, showRoutes],
  );

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
    // When the scene drives an ambient cinematic loop, it owns the camera — skip
    // the static framing so the two don't fight.
    if (scene?.ambient) return;
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
  const routePointStyle = useMemo(() => buildRoutePointStyle(colors), [colors]);

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
  const stopCollection = useMemo(() => buildStopCollection(stopMarkers), [stopMarkers]);
  const stopDotStyle = useMemo(() => buildStopDotStyle(colors), [colors]);
  const stopLabelStyle = useMemo(() => buildStopLabelStyle(colors), [colors]);

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
      onTouchStart={ambientPlan ? bumpInteract : undefined}
      onTouchMove={ambientPlan ? bumpInteract : undefined}
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
        ref={mapViewRef}
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
              const shape = buildLineGroupShape(group);
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
                <MarkerView marker={marker} />
              </PointAnnotation>
            ))}
          </>
        )}
      </MapView>

      {/* Frozen snapshot used to hide the camera reposition during an ambient
          dissolve — fades out to reveal the live map beneath it (never black). */}
      {snapshotUri && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Animated.Image
            source={{ uri: snapshotUri }}
            style={[StyleSheet.absoluteFill, snapshotStyle]}
            resizeMode="cover"
            onLoad={onSnapshotLoad}
          />
        </View>
      )}
    </View>
  );
}

const createStyles = (_colors: ThemeColors) =>
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
  });
