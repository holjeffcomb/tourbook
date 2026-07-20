// Pure camera + framing math for MapStage.
//
// We compute the framing camera (center + zoom) ourselves instead of handing
// `bounds` to Mapbox: on the new architecture `setCamera({bounds})` only
// re-centers and keeps the current zoom (it never fits), so returning from a
// zoomed-in screen would strand the camera zoomed-in on the bounds' midpoint.
//
// Everything here is a pure function of its inputs (no component state), which
// keeps the stage's camera effect small and lets this math be unit-tested.

import { trimmedOverviewFrame } from '@/lib/geo';
import type { Coord, MapScene, RouteLine } from './mapScene';

const TILE = 512;
export const FIT_MAX_ZOOM = 16;

/** Instant fallback view (continental US) before any scene has framed. */
export const FALLBACK_CAMERA = { centerCoordinate: [-98.5, 39.8] as Coord, zoomLevel: 2.5 };

// Switching between map pages (tabs / detail screens) uses a long flyTo so the
// world glides instead of snapping. In-page reframes keep each scene's own timing.
export const PAGE_GLIDE = { durationMs: 2800, mode: 'flyTo' as const };

type Padding = { top: number; right: number; bottom: number; left: number };

export function lngToNormX(lng: number): number {
  return (lng + 180) / 360;
}

export function latToNormY(latDeg: number): number {
  const lat = Math.max(Math.min(latDeg, 85.05112878), -85.05112878);
  const r = (lat * Math.PI) / 180;
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + r / 2)) / (2 * Math.PI);
}

export function normYToLat(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}

/**
 * Camera (center + zoom) that fits [sw, ne] inside `width`×`height` px while
 * honouring per-side padding, so the framed content is centred in the *unpadded*
 * region (e.g. above the bottom sheet). Mirrors Mapbox's own bounds fitting.
 */
export function fitCamera(
  ne: Coord,
  sw: Coord,
  width: number,
  height: number,
  pad: Padding,
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

export function sceneCoords(scene: MapScene): Coord[] {
  if (scene.focus && scene.focus.length > 0) return scene.focus;
  const coords: Coord[] = [];
  for (const p of scene.places ?? []) coords.push([p.longitude, p.latitude]);
  for (const r of scene.routes ?? []) for (const c of r.coordinates) coords.push(c);
  for (const m of scene.markers ?? []) coords.push(m.coordinate);
  for (const g of scene.lines ?? []) for (const seg of g.segments) for (const c of seg) coords.push(c);
  return coords;
}

/** Sparse samples along a polyline so densified routes don't dominate framing. */
export function sampleRouteCoords(coords: Coord[], maxPoints = 48): Coord[] {
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
export function framingCoords(
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
export function padCenter(center: Coord, zoom: number, pad: Padding): Coord {
  const worldSize = TILE * 2 ** zoom;
  const centerXNorm = lngToNormX(center[0]) + (pad.right - pad.left) / 2 / worldSize;
  const centerYNorm = latToNormY(center[1]) + (pad.bottom - pad.top) / 2 / worldSize;
  return [centerXNorm * 360 - 180, normYToLat(centerYNorm)];
}

/** A resolved camera frame: a bbox (`ne`/`sw`), an optional locked `center`
 * (trimmed overviews), or a `single` point when there's only one coordinate. */
export type Framing = {
  ne: Coord;
  sw: Coord;
  center: Coord | null;
  single: Coord | null;
  zoom: number;
};

/**
 * Resolve the camera frame for a scene from its coordinates. Returns `null` when
 * there's nothing to frame. Pure — the stage turns this into an actual
 * `setCamera` call (with animation choice) in an effect.
 */
export function computeFraming(
  scene: MapScene,
  routes: RouteLine[],
  showRoutes: boolean,
): Framing | null {
  const coords = framingCoords(scene, routes, showRoutes);
  if (coords.length === 0) return null;
  if (coords.length === 1) {
    return {
      ne: coords[0],
      sw: coords[0],
      center: null,
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
      single: null,
      zoom: scene.singleZoom ?? 9,
    };
  }
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return {
    ne: [Math.max(...lngs), Math.max(...lats)],
    sw: [Math.min(...lngs), Math.min(...lats)],
    center: null,
    single: null,
    zoom: scene.singleZoom ?? 9,
  };
}
