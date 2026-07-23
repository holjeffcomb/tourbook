import {
  computeFraming,
  fitCamera,
  framingCoords,
  latToNormY,
  lngToNormX,
  normYToLat,
  padCenter,
  sampleRouteCoords,
  sceneCoords,
} from './mapCamera';
import type { Coord, MapScene } from './mapScene';

describe('web-mercator projection', () => {
  it('maps longitude linearly to [0, 1]', () => {
    expect(lngToNormX(-180)).toBeCloseTo(0, 10);
    expect(lngToNormX(0)).toBeCloseTo(0.5, 10);
    expect(lngToNormX(180)).toBeCloseTo(1, 10);
  });

  it('maps the equator to the vertical midpoint', () => {
    expect(latToNormY(0)).toBeCloseTo(0.5, 10);
  });

  it('increases normalized Y as latitude decreases (north is up)', () => {
    expect(latToNormY(45)).toBeLessThan(latToNormY(0));
    expect(latToNormY(-45)).toBeGreaterThan(latToNormY(0));
  });

  it('clamps latitude to the mercator limit', () => {
    // Beyond ~85.05 the projection is clamped, so 89 and 86 map identically.
    expect(latToNormY(89)).toBeCloseTo(latToNormY(86), 10);
  });

  it('round-trips latitude through normY', () => {
    for (const lat of [-60, -12.34, 0, 37.77, 51.5]) {
      expect(normYToLat(latToNormY(lat))).toBeCloseTo(lat, 6);
    }
  });
});

describe('fitCamera', () => {
  const noPad = { top: 0, right: 0, bottom: 0, left: 0 };

  it('centers the camera on the middle of the bounds with no padding', () => {
    const { center, zoom } = fitCamera([10, 10], [-10, -10], 1000, 1000, noPad, 16);
    expect(center[0]).toBeCloseTo(0, 6);
    expect(center[1]).toBeCloseTo(0, 6);
    expect(Number.isFinite(zoom)).toBe(true);
    expect(zoom).toBeGreaterThan(0);
  });

  it('never exceeds the max zoom for tiny bounds', () => {
    const { zoom } = fitCamera([0.001, 0.001], [-0.001, -0.001], 1000, 1000, noPad, 16);
    expect(zoom).toBeLessThanOrEqual(16);
  });

  it('zooms out further for a larger span', () => {
    const wide = fitCamera([90, 45], [-90, -45], 1000, 1000, noPad, 16).zoom;
    const narrow = fitCamera([10, 5], [-10, -5], 1000, 1000, noPad, 16).zoom;
    expect(wide).toBeLessThan(narrow);
  });

  it('shifts the center toward larger padding (content sits in the unpadded region)', () => {
    const bottomPad = { top: 0, right: 0, bottom: 400, left: 0 };
    const shifted = fitCamera([10, 10], [-10, -10], 1000, 1000, bottomPad, 16);
    // Extra bottom padding pushes the map center southward (lower latitude).
    expect(shifted.center[1]).toBeLessThan(0);
  });
});

describe('sampleRouteCoords', () => {
  it('returns the input unchanged when under the cap', () => {
    const coords: Coord[] = [
      [0, 0],
      [1, 1],
    ];
    expect(sampleRouteCoords(coords, 48)).toBe(coords);
  });

  it('downsamples to the cap while keeping the endpoints', () => {
    const coords: Coord[] = Array.from({ length: 200 }, (_, i) => [i, i] as Coord);
    const out = sampleRouteCoords(coords, 48);
    expect(out).toHaveLength(48);
    expect(out[0]).toEqual(coords[0]);
    expect(out[out.length - 1]).toEqual(coords[coords.length - 1]);
  });
});

describe('padCenter', () => {
  it('is a no-op with symmetric padding', () => {
    const [lng, lat] = padCenter([12, 34], 4, { top: 50, right: 50, bottom: 50, left: 50 });
    expect(lng).toBeCloseTo(12, 6);
    expect(lat).toBeCloseTo(34, 6);
  });

  it('shifts the returned center when padding is asymmetric', () => {
    const base: Coord = [0, 0];
    const shifted = padCenter(base, 4, { top: 0, right: 0, bottom: 300, left: 0 });
    expect(shifted[1]).toBeLessThan(0);
  });
});

describe('sceneCoords / framingCoords', () => {
  const place = { id: 'p1', latitude: 40, longitude: -70 };

  it('prefers explicit focus coordinates', () => {
    const scene: MapScene = { key: 's', focus: [[1, 2]], places: [place] };
    expect(sceneCoords(scene)).toEqual([[1, 2]]);
    expect(framingCoords(scene, [], false)).toEqual([[1, 2]]);
  });

  it('collects coordinates from places, routes, markers and lines', () => {
    const scene: MapScene = {
      key: 's',
      places: [place],
      routes: [{ id: 'r', coordinates: [[1, 1]] }],
      markers: [{ id: 'm', coordinate: [2, 2], kind: 'show' }],
      lines: [{ id: 'l', segments: [[[3, 3]]] }],
    };
    expect(sceneCoords(scene)).toEqual([
      [-70, 40],
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it('uses place pins over route geometry when showing routes', () => {
    const scene: MapScene = {
      key: 's',
      places: [place],
      routes: [{ id: 'r', coordinates: [[9, 9]] }],
    };
    expect(framingCoords(scene, scene.routes!, true)).toEqual([[-70, 40]]);
  });
});

describe('computeFraming', () => {
  it('returns null when there is nothing to frame', () => {
    expect(computeFraming({ key: 's' }, [], false)).toBeNull();
  });

  it('reports a single point with its zoom', () => {
    const scene: MapScene = { key: 's', focus: [[5, 6]], singleZoom: 11 };
    const framing = computeFraming(scene, [], false);
    expect(framing).toMatchObject({ single: [5, 6], center: null, zoom: 11 });
  });

  it('computes a bounding box from multiple coordinates', () => {
    const scene: MapScene = {
      key: 's',
      focus: [
        [-10, -5],
        [10, 5],
        [3, 1],
      ],
    };
    const framing = computeFraming(scene, [], false);
    expect(framing?.ne).toEqual([10, 5]);
    expect(framing?.sw).toEqual([-10, -5]);
    expect(framing?.single).toBeNull();
  });
});
