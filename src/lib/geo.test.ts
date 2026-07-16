import { trimmedOverviewFrame } from '@/lib/geo';

describe('trimmedOverviewFrame', () => {
  it('centers on the midpoint of all points', () => {
    const pts: [number, number][] = [
      [-122.4, 37.8], // SF
      [2.35, 48.86], // Paris
    ];
    const frame = trimmedOverviewFrame(pts);
    expect(frame.center[0]).toBeCloseTo((-122.4 + 2.35) / 2, 5);
    expect(frame.center[1]).toBeCloseTo((37.8 + 48.86) / 2, 5);
  });

  it('keeps the full-set center for US + Europe while trimming the farthest 20%', () => {
    const us: [number, number][] = [
      [-122.4, 37.8], // SF (far west)
      [-118.2, 34.0], // LA
      [-104.99, 39.74], // Denver
      [-97.7, 30.3], // Austin
      [-87.6, 41.9], // Chicago
      [-74.0, 40.7], // NYC
    ];
    const europe: [number, number][] = [
      [-9.14, 38.72], // Lisbon
      [-0.13, 51.5], // London
      [2.35, 48.86], // Paris
      [13.4, 52.52], // Berlin (far east)
    ];
    const all = [...us, ...europe];
    const frame = trimmedOverviewFrame(all, 0.8);

    // Mid-Atlantic-ish center of the full bounding box — not a US or EU cluster.
    expect(frame.center[0]).toBeGreaterThan(-70);
    expect(frame.center[0]).toBeLessThan(0);
    expect(frame.center[1]).toBeGreaterThan(30);
    expect(frame.center[1]).toBeLessThan(55);

    // Zoom bounds come from ~80% closest points — tighter than the full span.
    const fullLngSpan = Math.max(...all.map((c) => c[0])) - Math.min(...all.map((c) => c[0]));
    const frameLngSpan = frame.ne[0] - frame.sw[0];
    expect(frameLngSpan).toBeLessThan(fullLngSpan);

    // Still spans both sides of the Atlantic.
    expect(frame.sw[0]).toBeLessThan(-70);
    expect(frame.ne[0]).toBeGreaterThan(-10);
  });

  it('does not collapse a compact continental set', () => {
    const pts: [number, number][] = [
      [-74.0, 40.7],
      [-87.6, 41.9],
      [-118.2, 34.0],
      [-122.4, 37.8],
      [-97.7, 30.3],
    ];
    const frame = trimmedOverviewFrame(pts, 0.8);
    expect(frame.center[0]).toBeCloseTo((-122.4 + -74.0) / 2, 5);
    // With only 5 points, keeping 80% (4) still covers most of the US span.
    expect(frame.ne[0] - frame.sw[0]).toBeGreaterThan(30);
  });
});
