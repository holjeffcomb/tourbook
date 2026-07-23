// Pure style builders and layout constants for the map overlays (clustered
// places, tour routes, numbered stops). Each builder maps theme colours (and a
// basemap "vivid" flag) to an @rnmapbox layer style object — no component
// state, so they're trivial to reason about and reuse. Extracted from MapStage
// so the stage stays focused on orchestration and rendering.

import type { CircleLayerStyle, LineLayerStyle, SymbolLayerStyle } from '@rnmapbox/maps';
import type { ThemeColors } from '@/theme';
import { expr, type MapStyleVariant } from './mapConfig';

// Baked-in tuning for the clustered places / routes overlays (previously the
// Lifetime map's config). Kept as constants so the shared stage stays simple.
export const CLUSTER = { radius: 50, maxZoom: 12 };
export const POINTS = {
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
export const ROUTE = {
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

export const PLACE_LABEL_MIN_ZOOM = 8.5;
export const CLUSTER_PROPERTIES = { totalVisits: ['+', ['get', 'weight']] };

/** Standard dusk/night/satellite — busy, colourful basemaps that need louder overlays. */
export function isVividBasemap(variant: MapStyleVariant): boolean {
  return variant === 'dusk' || variant === 'night' || variant === 'satellite';
}

export function buildClusterStyle(colors: ThemeColors): CircleLayerStyle {
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

export function buildPointStyle(colors: ThemeColors): CircleLayerStyle {
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

export function buildCountStyle(
  colors: ThemeColors,
  field: 'totalVisits' | 'weight',
): SymbolLayerStyle {
  return {
    textField: expr(['to-string', ['get', field]]),
    textSize: 12,
    textColor: colors.onPrimary,
    textAllowOverlap: true,
    textIgnorePlacement: true,
  };
}

export function buildSelectedStyle(colors: ThemeColors): CircleLayerStyle {
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
export function buildRouteLineStyle(colors: ThemeColors, vivid: boolean): LineLayerStyle {
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
export function buildRouteCasingStyle(): LineLayerStyle {
  return {
    lineColor: ROUTE.vividCasing,
    lineWidth: ROUTE.vividLineWidth + ROUTE.vividCasingExtra,
    lineOpacity: ROUTE.vividCasingOpacity,
    lineCap: 'round',
    lineJoin: 'round',
    lineEmissiveStrength: 1,
  };
}

export function buildRouteDotStyle(colors: ThemeColors, vivid: boolean): CircleLayerStyle {
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

/** Small dot at each stop along a colour-coded route (the tour-list maps). */
export function buildRoutePointStyle(colors: ThemeColors): CircleLayerStyle {
  return {
    circleRadius: 2.5,
    circleColor: expr(['get', 'color']),
    circleOpacity: 0.95,
    circleStrokeColor: colors.surface,
    circleStrokeWidth: 0.5,
  };
}

/** City / venue name that fades in as you zoom toward a place. */
export function buildPlaceLabelStyle(colors: ThemeColors): SymbolLayerStyle {
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

/** Numbered tour-stop dots, coloured by kind (show / off day / TBD). */
export function buildStopDotStyle(colors: ThemeColors): CircleLayerStyle {
  return {
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
  };
}

/** Stop label (number / marker text) sitting on top of the stop dot. */
export function buildStopLabelStyle(colors: ThemeColors): SymbolLayerStyle {
  return {
    textField: expr(['get', 'label']),
    textSize: 12,
    textColor: expr(['match', ['get', 'kind'], 'tbd', colors.primary, colors.onPrimary]),
    // Halo in the circle's own colour keeps the number crisp over the route line.
    textHaloColor: expr(['match', ['get', 'kind'], 'show', colors.primary, colors.surface]),
    textHaloWidth: 1.2,
    textAllowOverlap: true,
    textIgnorePlacement: true,
  };
}
