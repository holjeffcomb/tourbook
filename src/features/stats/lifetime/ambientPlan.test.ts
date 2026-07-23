import type { MapPlace } from '@/features/maps/mapScene';
import {
  AMBIENT_MAX_ZOOM,
  AMBIENT_MIN_ZOOM,
  DWELL_MS,
  clusterPlaces,
  orderClusters,
  planAmbient,
  scoreClusters,
  zoomForCluster,
  type Cluster,
} from './ambientPlan';

function place(
  id: string,
  lng: number,
  lat: number,
  extra: Partial<MapPlace> = {},
): MapPlace {
  return { id, longitude: lng, latitude: lat, ...extra };
}

// Reference coordinates [lng, lat].
const LA = place('la', -118.24, 34.05, { weight: 10, lastVisit: '2026-06-01' });
const LONG_BEACH = place('lb', -118.19, 33.77, { weight: 3, lastVisit: '2026-05-20' }); // ~24mi from LA
const SF = place('sf', -122.42, 37.77, { weight: 5, lastVisit: '2026-03-01' }); // ~350mi from LA
const LONDON = place('ldn', -0.13, 51.51, { weight: 2, lastVisit: '2025-01-01' });

function clusterContaining(clusters: Cluster[], id: string): number {
  return clusters.findIndex((c) => c.places.some((p) => p.id === id));
}

describe('clusterPlaces', () => {
  it('groups nearby places and separates distant ones', () => {
    const clusters = clusterPlaces([LA, LONG_BEACH, SF, LONDON]);
    expect(clusters).toHaveLength(3);

    const laIdx = clusterContaining(clusters, 'la');
    expect(clusters[laIdx].places.map((p) => p.id).sort()).toEqual(['la', 'lb']);
    // SF and London each stand alone at a 180mi threshold.
    expect(clusterContaining(clusters, 'sf')).not.toBe(laIdx);
    expect(clusterContaining(clusters, 'ldn')).not.toBe(laIdx);
  });

  it('returns [] for no places', () => {
    expect(clusterPlaces([])).toEqual([]);
  });

  it('weights the centroid toward the busier place', () => {
    const [cluster] = clusterPlaces([LA, LONG_BEACH]);
    // LA (weight 10) is north/east of Long Beach (weight 3), so the weighted
    // centroid should sit closer to LA than the plain midpoint.
    const plainLat = (LA.latitude + LONG_BEACH.latitude) / 2;
    expect(cluster.centroid[1]).toBeGreaterThan(plainLat);
  });
});

describe('scoreClusters', () => {
  it('ranks the most-visited, most-recent cluster highest', () => {
    const clusters = clusterPlaces([LA, LONG_BEACH, SF, LONDON]);
    const scores = scoreClusters(clusters);
    const laIdx = clusterContaining(clusters, 'la');
    const topIdx = scores.indexOf(Math.max(...scores));
    expect(topIdx).toBe(laIdx);
  });

  it('returns [] for no clusters', () => {
    expect(scoreClusters([])).toEqual([]);
  });
});

describe('orderClusters', () => {
  it('starts at the top score and walks nearest-neighbor', () => {
    const clusters = clusterPlaces([LA, LONG_BEACH, SF, LONDON]);
    const scores = scoreClusters(clusters);
    const order = orderClusters(clusters, scores);

    expect(order).toHaveLength(3);
    // Starts at LA (highest score), then the nearest cluster (SF), then London.
    expect(order[0]).toBe(clusterContaining(clusters, 'la'));
    expect(order[1]).toBe(clusterContaining(clusters, 'sf'));
    expect(order[2]).toBe(clusterContaining(clusters, 'ldn'));
  });
});

describe('zoomForCluster', () => {
  const make = (spanDeg: number): Cluster => ({
    places: [],
    centroid: [0, 0],
    weight: 1,
    lastVisit: null,
    bbox: { minLng: 0, minLat: 0, maxLng: spanDeg, maxLat: spanDeg },
  });

  it('stays within the calm zoom band', () => {
    for (const span of [0, 0.1, 1, 5, 20, 90]) {
      const z = zoomForCluster(make(span));
      expect(z).toBeGreaterThanOrEqual(AMBIENT_MIN_ZOOM);
      expect(z).toBeLessThanOrEqual(AMBIENT_MAX_ZOOM);
    }
  });

  it('zooms out (never in) for a larger spread', () => {
    const tight = zoomForCluster(make(0.1));
    const wide = zoomForCluster(make(10));
    expect(tight).toBeGreaterThanOrEqual(wide);
  });
});

describe('planAmbient', () => {
  it('returns null when there are no places', () => {
    expect(planAmbient([])).toBeNull();
  });

  it('produces one frame per cluster with a valid, calm shape', () => {
    const plan = planAmbient([LA, LONG_BEACH, SF, LONDON], 42);
    expect(plan).not.toBeNull();
    expect(plan!.frames).toHaveLength(3);

    for (const f of plan!.frames) {
      expect(f.dwellMs).toBe(DWELL_MS);
      expect(f.zoom).toBeGreaterThanOrEqual(AMBIENT_MIN_ZOOM);
      expect(f.zoom).toBeLessThanOrEqual(AMBIENT_MAX_ZOOM);
      // A non-trivial pan: the dissolve-in point and the drift end differ.
      expect(f.center).not.toEqual(f.driftTo);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = planAmbient([LA, LONG_BEACH, SF, LONDON], 7);
    const b = planAmbient([LA, LONG_BEACH, SF, LONDON], 7);
    expect(a).toEqual(b);
  });
});
