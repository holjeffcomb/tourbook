import Mapbox from '@rnmapbox/maps';
import { env } from '@/lib/env';
import type { ColorScheme } from '@/theme';

// Central place to register the Mapbox token and derive style URLs so every map
// in the app stays consistent. Individual map components import from here rather
// than re-implementing token/style logic.
if (env.mapboxToken) {
  Mapbox.setAccessToken(env.mapboxToken);
}

/** Maps only render in a dev/production build with a Mapbox token configured. */
export const isMapboxConfigured = !!env.mapboxToken;

export type MapStyleVariant =
  // Low-chroma basemap so pins/heatmap read clearly (the "passport" look).
  | 'minimal'
  // Full street map with POI labels — shows nearby businesses around a place.
  | 'streets';

export function mapStyleUrl(scheme: ColorScheme, variant: MapStyleVariant): string {
  if (variant === 'streets') return Mapbox.StyleURL.Street;
  return scheme === 'dark' ? Mapbox.StyleURL.Dark : Mapbox.StyleURL.Light;
}

/**
 * Cast helper for Mapbox data-driven style expressions (e.g.
 * `['interpolate', ['linear'], ['get', 'weight'], 0, 0, 10, 1]`). Mapbox types
 * these as strict tuples; this keeps the style builders readable while the
 * expression shape is validated by Mapbox at runtime. The return type is
 * inferred from the property it's assigned to.
 */
export function expr<T>(expression: readonly unknown[]): T {
  return expression as T;
}

/** rgba() string from a #RRGGBB hex and an alpha in [0, 1]. */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
