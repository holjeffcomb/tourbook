// Pure GeoJSON builders for the map overlays. Each turns scene data (places,
// routes, stops, line groups) into the FeatureCollection a ShapeSource renders.
// No component state, so they're easy to reason about and reuse; MapStage wraps
// them in `useMemo` for referential stability.

import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { arcedPath } from '@/lib/geo';
import { ROUTE } from './mapLayerStyles';
import type { MapPlace, RouteLine, SceneLineGroup, SceneMarker } from './mapScene';

/** Clustered visited places (Lifetime), carrying weight + label for styling. */
export function buildPlaceCollection(places: MapPlace[]): FeatureCollection<Point> {
  return {
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
  };
}

/**
 * One feature per route, arced for a gentle curve. Colour is an optional
 * property so a single stable LineLayer can style every route from the source.
 */
export function buildRouteLines(routes: RouteLine[]): FeatureCollection<LineString> {
  return {
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
  };
}

/**
 * Visible stop dots for colour-coded routes (the list maps), mirroring the
 * Lifetime routes look: a thin translucent line with a dot at each stop.
 */
export function buildRoutePoints(routes: RouteLine[]): FeatureCollection<Point> {
  return {
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
  };
}

/** Numbered tour stops (shows / off days / TBD) as tappable point features. */
export function buildStopCollection(stopMarkers: SceneMarker[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: stopMarkers.map((m) => ({
      type: 'Feature',
      id: m.id,
      properties: { kind: m.kind, label: m.label ?? '', stopId: m.id },
      geometry: { type: 'Point', coordinates: m.coordinate },
    })),
  };
}

/** One line group's segments as a FeatureCollection (tour legs, connectors). */
export function buildLineGroupShape(group: SceneLineGroup): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: group.segments.map((seg, i): Feature<LineString> => ({
      type: 'Feature',
      id: `${group.id}-${i}`,
      properties: {},
      geometry: { type: 'LineString', coordinates: seg },
    })),
  };
}
