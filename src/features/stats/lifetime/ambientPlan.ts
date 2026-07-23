// Pure planning math for the Lifetime "ambient" cinematic map.
//
// Given the visited places, this builds an ordered itinerary of camera "frames"
// — one per geographic cluster — that the imperative player (`useAmbientCamera`)
// dissolves between and slowly pans across. Everything here is a pure function
// of its inputs (deterministic given a seed), so it's unit-testable and carries
// no React/Mapbox state.

import { haversineMiles } from '@/lib/geo';
import type { AmbientFrame, AmbientPlan, Coord, MapPlace } from '@/features/maps/mapScene';

export type { AmbientFrame, AmbientPlan };

// --- Tunables (dialed in during the P4 device pass) --------------------------

/** Places within this great-circle distance group into one cluster/region. */
export const CLUSTER_MILES = 180;
/** Calm zoom band: never wider than a region, never tighter than a metro. */
export const AMBIENT_MIN_ZOOM = 4.5;
export const AMBIENT_MAX_ZOOM = 8;
/** How long the camera slowly pans across one cluster (ms). */
export const DWELL_MS = 17000;
/** Fraction of a cluster's half-span the Ken Burns pan drifts across. */
export const DRIFT_FRACTION = 0.5;
/** Minimum drift so a single-point cluster still gets gentle motion (degrees). */
export const MIN_DRIFT_DEG = 0.12;
/** Recency vs. visit-weight blend for scoring the *starting* cluster. */
const RECENCY_WEIGHT = 0.4;
const VISIT_WEIGHT = 0.6;

export type Cluster = {
  places: MapPlace[];
  /** Visit-weighted centroid [lng, lat]. */
  centroid: Coord;
  /** Σ visit weights across member places. */
  weight: number;
  /** Most recent `lastVisit` (ISO date) across members, or null. */
  lastVisit: string | null;
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number };
};

type Rng = () => number;

/** Deterministic small PRNG (mulberry32) so plans are stable without input. */
function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function placeWeight(p: MapPlace): number {
  return p.weight && p.weight > 0 ? p.weight : 1;
}

/**
 * Single-linkage clustering by great-circle distance (union-find). Two places in
 * the same cluster are within `thresholdMiles` of *some* chain of members, so a
 * metro/region groups together. O(n²) in place count — fine for the deduped
 * city list (hundreds at most), and only runs when the data/year changes.
 */
export function clusterPlaces(places: MapPlace[], thresholdMiles = CLUSTER_MILES): Cluster[] {
  const n = places.length;
  if (n === 0) return [];

  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== root) {
      const next = parent[i];
      parent[i] = root;
      i = next;
    }
    return root;
  };
  const union = (i: number, j: number) => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[rj] = ri;
  };

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const a = places[i];
      const b = places[j];
      if (haversineMiles(a.latitude, a.longitude, b.latitude, b.longitude) <= thresholdMiles) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, MapPlace[]>();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    const arr = groups.get(root);
    if (arr) arr.push(places[i]);
    else groups.set(root, [places[i]]);
  }

  return [...groups.values()].map(toCluster);
}

function toCluster(members: MapPlace[]): Cluster {
  let sumW = 0;
  let sumLng = 0;
  let sumLat = 0;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let lastVisit: string | null = null;

  for (const p of members) {
    const w = placeWeight(p);
    sumW += w;
    sumLng += p.longitude * w;
    sumLat += p.latitude * w;
    if (p.longitude < minLng) minLng = p.longitude;
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.longitude > maxLng) maxLng = p.longitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
    if (p.lastVisit && (!lastVisit || p.lastVisit > lastVisit)) lastVisit = p.lastVisit;
  }

  return {
    places: members,
    centroid: [sumLng / sumW, sumLat / sumW],
    weight: sumW,
    lastVisit,
    bbox: { minLng, minLat, maxLng, maxLat },
  };
}

/** Normalized [0,1] score per cluster blending visit weight and recency. */
export function scoreClusters(clusters: Cluster[]): number[] {
  if (clusters.length === 0) return [];
  const weights = clusters.map((c) => c.weight);
  const maxW = Math.max(...weights);

  const times = clusters.map((c) => (c.lastVisit ? Date.parse(c.lastVisit) : NaN));
  const validTimes = times.filter((t) => Number.isFinite(t));
  const minT = validTimes.length ? Math.min(...validTimes) : 0;
  const maxT = validTimes.length ? Math.max(...validTimes) : 0;
  const spanT = maxT - minT;

  return clusters.map((c, i) => {
    const wNorm = maxW > 0 ? c.weight / maxW : 0;
    const t = times[i];
    const rNorm = Number.isFinite(t) && spanT > 0 ? (t - minT) / spanT : Number.isFinite(t) ? 1 : 0;
    return VISIT_WEIGHT * wNorm + RECENCY_WEIGHT * rNorm;
  });
}

/**
 * Visit order: start at the highest-scoring cluster, then greedily hop to the
 * nearest unvisited cluster (nearest-neighbor path). This makes the camera
 * "travel" region-to-region logically; a large gap (e.g. crossing an ocean)
 * naturally lands on a dissolve.
 */
export function orderClusters(clusters: Cluster[], scores: number[]): number[] {
  const n = clusters.length;
  if (n === 0) return [];

  let start = 0;
  for (let i = 1; i < n; i += 1) if (scores[i] > scores[start]) start = i;

  const visited = new Array<boolean>(n).fill(false);
  const order: number[] = [start];
  visited[start] = true;

  for (let step = 1; step < n; step += 1) {
    const from = clusters[order[order.length - 1]].centroid;
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < n; i += 1) {
      if (visited[i]) continue;
      const to = clusters[i].centroid;
      const d = haversineMiles(from[1], from[0], to[1], to[0]);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    order.push(best);
    visited[best] = true;
  }

  return order;
}

/** Rough zoom that frames a cluster's spread, clamped to the calm band. */
export function zoomForCluster(cluster: Cluster): number {
  const { minLat, minLng, maxLat, maxLng } = cluster.bbox;
  const diagMiles = haversineMiles(minLat, minLng, maxLat, maxLng);
  // Empirical: ~30k-mile reference across the zoom scale; larger spread → lower
  // zoom. Clamped so we never show the whole world or dive to street level.
  const raw = Math.log2(30000 / Math.max(diagMiles, 25));
  return Math.max(AMBIENT_MIN_ZOOM, Math.min(AMBIENT_MAX_ZOOM, raw));
}

/** Build the ordered frames for one cluster's dwell (dissolve-in + slow pan). */
function frameForCluster(cluster: Cluster, rng: Rng): AmbientFrame {
  const [cLng, cLat] = cluster.centroid;
  const halfLng = (cluster.bbox.maxLng - cluster.bbox.minLng) / 2;
  const halfLat = (cluster.bbox.maxLat - cluster.bbox.minLat) / 2;

  // Drift direction: a stable-but-varied angle so repeats don't feel identical.
  const angle = rng() * Math.PI * 2;
  const driftLng = Math.max(halfLng * DRIFT_FRACTION, MIN_DRIFT_DEG) * Math.cos(angle);
  const driftLat = Math.max(halfLat * DRIFT_FRACTION, MIN_DRIFT_DEG) * Math.sin(angle);

  // Sweep through the centroid: start half a drift back, end half a drift ahead.
  const center: Coord = [cLng - driftLng / 2, cLat - driftLat / 2];
  const driftTo: Coord = [cLng + driftLng / 2, cLat + driftLat / 2];

  return { center, zoom: zoomForCluster(cluster), driftTo, dwellMs: DWELL_MS };
}

/**
 * Build the full ambient plan from visited places. Returns `null` when there's
 * nothing to show. `seed` keeps drift directions deterministic (override in
 * tests); it defaults to the place count so the plan is stable across renders.
 */
export function planAmbient(places: MapPlace[], seed?: number): AmbientPlan | null {
  if (places.length === 0) return null;
  const clusters = clusterPlaces(places);
  if (clusters.length === 0) return null;

  const scores = scoreClusters(clusters);
  const order = orderClusters(clusters, scores);
  const rng = seededRng(seed ?? places.length + clusters.length);

  const frames = order.map((idx) => frameForCluster(clusters[idx], rng));
  return { frames };
}
