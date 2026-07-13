import type { TourStop } from '@/features/shows/api';
import {
  computeDriveSegments,
  computeNearMisses,
  computePassportStats,
  computeTourRoutes,
  computeTourStats,
  computeVisitedPlaces,
  isUpcomingNearMiss,
  partitionNearMisses,
} from '@/features/stats/compute';
import {
  arcedPath,
  densifyPath,
  EARTH_CIRCUMFERENCE_MILES,
  formatEarthLaps,
  formatMiles,
  haversineMiles,
  inferCountryFromCity,
} from '@/lib/geo';

function stop(
  partial: Partial<TourStop> & Pick<TourStop, 'id' | 'date' | 'kind'>,
): TourStop {
  return {
    created_at: '',
    created_by: null,
    label: null,
    venueId: null,
    location: null,
    ...partial,
  };
}

describe('haversineMiles', () => {
  it('returns ~0 for the same point', () => {
    expect(haversineMiles(40, -105, 40, -105)).toBeCloseTo(0, 0);
  });

  it('returns a plausible NYC–LA distance', () => {
    const miles = haversineMiles(40.7128, -74.006, 34.0522, -118.2437);
    expect(miles).toBeGreaterThan(2400);
    expect(miles).toBeLessThan(2500);
  });
});

describe('formatMiles', () => {
  it('formats short distances with one decimal', () => {
    expect(formatMiles(42.34)).toBe('42.3 mi');
  });

  it('formats long distances as integers', () => {
    expect(formatMiles(1234.5)).toBe('1,235 mi');
  });
});

describe('formatEarthLaps', () => {
  it('expresses distance as fractions of Earth circumference', () => {
    expect(formatEarthLaps(EARTH_CIRCUMFERENCE_MILES)).toBe('1.00×');
  });
});

describe('inferCountryFromCity', () => {
  it('infers US from state abbreviations', () => {
    expect(inferCountryFromCity('Morrison, CO')).toBe('United States');
  });

  it('infers UK from country code', () => {
    expect(inferCountryFromCity('London, UK')).toBe('United Kingdom');
  });
});

describe('computeTourStats', () => {
  it('counts shows, off days, and drive segments', () => {
    const stops: TourStop[] = [
      stop({
        id: '1',
        date: '2026-07-10',
        kind: 'show',
        location: {
          name: 'Venue A',
          city: 'Denver, CO',
          address: null,
          latitude: 39.7392,
          longitude: -104.9903,
          booked: true,
        },
      }),
      stop({
        id: '2',
        date: '2026-07-11',
        kind: 'off',
        location: {
          name: 'Hotel',
          city: 'Cheyenne, WY',
          address: null,
          latitude: 41.14,
          longitude: -104.8202,
          booked: false,
        },
      }),
      stop({
        id: '3',
        date: '2026-07-13',
        kind: 'show',
        location: {
          name: 'Venue B',
          city: 'Salt Lake City, UT',
          address: null,
          latitude: 40.7608,
          longitude: -111.891,
          booked: true,
        },
      }),
    ];

    const stats = computeTourStats(stops);
    expect(stats.showCount).toBe(2);
    expect(stats.offDayCount).toBe(1);
    expect(stats.segmentCount).toBe(2);
    expect(stats.totalMiles).toBeGreaterThan(0);
    expect(stats.longestDrive).not.toBeNull();
    expect(stats.shortestDrive).not.toBeNull();
    expect(stats.calendarDays).toBe(4);
  });
});

describe('computeDriveSegments', () => {
  it('skips stops without coordinates', () => {
    const stops: TourStop[] = [
      stop({ id: '1', date: '2026-01-01', kind: 'show', location: null }),
      stop({
        id: '2',
        date: '2026-01-02',
        kind: 'show',
        location: {
          name: 'A',
          city: 'X',
          address: null,
          latitude: 40,
          longitude: -105,
          booked: true,
        },
      }),
    ];
    expect(computeDriveSegments(stops)).toHaveLength(0);
  });
});

describe('computePassportStats', () => {
  it('aggregates across tours', () => {
    const stats = computePassportStats({
      userId: 'me',
      tours: [{ id: 't1', actName: 'Band' }],
      stopsByTourId: {
        t1: [
          stop({
            id: '1',
            date: '2026-07-10',
            kind: 'show',
            location: {
              name: 'Venue',
              city: 'Denver, CO',
              address: null,
              latitude: 39.7392,
              longitude: -104.9903,
              booked: true,
            },
          }),
        ],
      },
      membersByTourId: {
        t1: [
          {
            id: 'm1',
            user_id: 'friend',
            role: null,
            created_at: '',
            profile: { display_name: 'Alex', username: null },
          },
        ],
      },
    });

    expect(stats.tourCount).toBe(1);
    expect(stats.totalShows).toBe(1);
    expect(stats.mostTouredWith?.name).toBe('Alex');
    expect(stats.mostTouredWith?.userId).toBe('friend');
    expect(stats.uniqueCountries).toBe(1);
  });
});

describe('computeVisitedPlaces', () => {
  it('merges repeat visits and sorts by weight', () => {
    const denver = {
      name: 'Venue A',
      city: 'Denver, CO',
      address: null,
      latitude: 39.7392,
      longitude: -104.9903,
      booked: true,
    };
    const places = computeVisitedPlaces({
      t1: [
        stop({ id: '1', date: '2026-07-10', kind: 'show', location: denver }),
        stop({
          id: '2',
          date: '2026-07-11',
          kind: 'show',
          location: {
            name: 'Venue B',
            city: 'Salt Lake City, UT',
            address: null,
            latitude: 40.7608,
            longitude: -111.891,
            booked: true,
          },
        }),
      ],
      t2: [stop({ id: '3', date: '2027-01-01', kind: 'show', location: denver })],
    });

    expect(places).toHaveLength(2);
    expect(places[0].weight).toBe(2);
    expect(places[0].city).toBe('Denver, CO');
    expect(places[0].tourIds.sort()).toEqual(['t1', 't2']);
    expect(places[0].lastVisit).toBe('2027-01-01');
    expect(places[0].booked).toBe(true);
    expect(places[1].weight).toBe(1);
    expect(places[1].tourIds).toEqual(['t1']);
  });

  it('skips stops without coordinates', () => {
    const places = computeVisitedPlaces({
      t1: [
        stop({ id: '1', date: '2026-07-10', kind: 'show', location: null }),
        stop({
          id: '2',
          date: '2026-07-11',
          kind: 'off',
          location: {
            name: 'Venue TBD',
            city: 'Reno, NV',
            address: null,
            latitude: null,
            longitude: null,
            booked: false,
          },
        }),
      ],
    });
    expect(places).toHaveLength(0);
  });
});

describe('computeTourRoutes', () => {
  it('returns located stops in date order and skips single-point tours', () => {
    const routes = computeTourRoutes({
      t1: [
        stop({
          id: 'b',
          date: '2026-07-11',
          kind: 'show',
          location: {
            name: 'B',
            city: '',
            address: null,
            latitude: 40,
            longitude: -111,
            booked: true,
          },
        }),
        stop({
          id: 'a',
          date: '2026-07-10',
          kind: 'show',
          location: {
            name: 'A',
            city: '',
            address: null,
            latitude: 39,
            longitude: -104,
            booked: true,
          },
        }),
        stop({ id: 'c', date: '2026-07-12', kind: 'show', location: null }),
      ],
      // Only one located stop → no line.
      t2: [
        stop({
          id: 'd',
          date: '2026-07-10',
          kind: 'show',
          location: {
            name: 'D',
            city: '',
            address: null,
            latitude: 34,
            longitude: -118,
            booked: true,
          },
        }),
      ],
    });

    expect(routes).toHaveLength(1);
    expect(routes[0].tourId).toBe('t1');
    // Sorted by date: A (-104) then B (-111).
    expect(routes[0].coordinates).toEqual([
      [-104, 39],
      [-111, 40],
    ]);
  });
});

describe('densifyPath', () => {
  it('inserts intermediate points along long segments', () => {
    const dense = densifyPath(
      [
        [-104, 39],
        [-111, 40],
      ],
      100,
    );
    expect(dense.length).toBeGreaterThan(2);
    expect(dense[0]).toEqual([-104, 39]);
    expect(dense[dense.length - 1]).toEqual([-111, 40]);
  });

  it('returns endpoints for a short segment', () => {
    const dense = densifyPath(
      [
        [-104, 39],
        [-104.01, 39.01],
      ],
      100,
    );
    expect(dense).toEqual([
      [-104, 39],
      [-104.01, 39.01],
    ]);
  });
});

describe('arcedPath', () => {
  it('keeps endpoints and bows away from the straight line', () => {
    const a: [number, number] = [-104, 39];
    const b: [number, number] = [-111, 39];
    const arc = arcedPath([a, b], 0.2, 16);
    expect(arc[0]).toEqual(a);
    expect(arc[arc.length - 1]).toEqual(b);
    // Midpoint of the arc should be pushed north of the straight midpoint (39).
    const mid = arc[Math.floor(arc.length / 2)];
    expect(mid[1]).toBeGreaterThan(39);
  });

  it('returns the input unchanged for a single point', () => {
    expect(arcedPath([[-104, 39]], 0.2, 16)).toEqual([[-104, 39]]);
  });
});

describe('computeNearMisses', () => {
  it('finds nearby stops on the same day', () => {
    const toursA = [{ id: 't1', actName: 'A', title: null }];
    const toursB = [{ id: 't2', actName: 'B', title: null }];
    const stopsA = {
      t1: [
        stop({
          id: 's1',
          date: '2024-06-10',
          kind: 'show',
          location: {
            name: 'Chicago Theatre',
            city: 'Chicago, IL',
            address: null,
            latitude: 41.8853,
            longitude: -87.6278,
            booked: true,
          },
        }),
      ],
    };
    const stopsB = {
      t2: [
        stop({
          id: 's2',
          date: '2024-06-10',
          kind: 'show',
          location: {
            name: 'Pabst',
            city: 'Milwaukee, WI',
            address: null,
            latitude: 43.039,
            longitude: -87.9109,
            booked: true,
          },
        }),
      ],
    };

    const misses = computeNearMisses(toursA, toursB, stopsA, stopsB, { maxMiles: 100 });
    expect(misses.length).toBe(1);
    expect(misses[0].kind).toBe('nearby');
    expect(misses[0].milesApart).toBeGreaterThan(70);
    expect(misses[0].milesApart).toBeLessThan(100);
  });

  it('partitions upcoming vs past by the later stop date', () => {
    const pastMiss = {
      dateA: '2024-01-01',
      dateB: '2024-01-01',
    };
    const upcomingMiss = {
      dateA: '2099-06-01',
      dateB: '2099-06-02',
    };
    expect(isUpcomingNearMiss(pastMiss, '2026-07-12')).toBe(false);
    expect(isUpcomingNearMiss(upcomingMiss, '2026-07-12')).toBe(true);

    const partitioned = partitionNearMisses(
      [
        {
          ...pastMiss,
          stopA: {
            stopId: 'a',
            label: 'A',
            city: 'X',
            lat: 0,
            lng: 0,
            tourId: 't1',
            tourTitle: null,
            actName: 'A',
          },
          stopB: {
            stopId: 'b',
            label: 'B',
            city: 'Y',
            lat: 0,
            lng: 0,
            tourId: 't2',
            tourTitle: null,
            actName: 'B',
          },
          milesApart: 10,
          kind: 'nearby' as const,
        },
        {
          ...upcomingMiss,
          stopA: {
            stopId: 'c',
            label: 'C',
            city: 'X',
            lat: 0,
            lng: 0,
            tourId: 't3',
            tourTitle: null,
            actName: 'A',
          },
          stopB: {
            stopId: 'd',
            label: 'D',
            city: 'Y',
            lat: 0,
            lng: 0,
            tourId: 't4',
            tourTitle: null,
            actName: 'B',
          },
          milesApart: 5,
          kind: 'nearby' as const,
        },
      ],
      '2026-07-12',
    );
    expect(partitioned.upcoming).toHaveLength(1);
    expect(partitioned.past).toHaveLength(1);
    expect(partitioned.upcoming[0].dateA).toBe('2099-06-01');
  });
});
