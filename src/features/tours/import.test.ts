import { createImportedTour, type CreateImportedTourInput } from './import';
import { resolveShowLocation } from '@/features/shows/api';
import { findCatalogVenue } from '@/features/venues/api';
import { geocodeVenue } from '@/lib/mapbox';
import { supabase } from '@/lib/supabase';

// The import commit is a client-side "prepare, then one atomic RPC" step. Resolution
// (venue/geocode) is exercised elsewhere; here we mock it and assert the payload we hand to
// `create_imported_tour` — that it uses the STABLE ids supplied in the variables (never mints its
// own), computes min/max dates, makes a single call (not one-per-stop), and keeps the booked vs
// city-only distinction in the jsonb.
jest.mock('@/features/shows/api', () => ({ resolveShowLocation: jest.fn() }));
jest.mock('@/features/venues/api', () => ({ findCatalogVenue: jest.fn() }));
jest.mock('@/lib/mapbox', () => ({ geocodeAddress: jest.fn(), geocodeVenue: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

const mockResolve = resolveShowLocation as jest.Mock;
const mockCatalog = findCatalogVenue as jest.Mock;
const mockGeocode = geocodeVenue as jest.Mock;
const mockRpc = supabase.rpc as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockResolvedValue({ data: null, error: null });
});

function bookedResult(venueId: string) {
  return { venue_id: venueId, city: null, country: null, latitude: null, longitude: null, address: null };
}
function inlineResult(city: string) {
  return { venue_id: null, city, country: 'United States', latitude: 39.5, longitude: -119.8, address: null };
}

const baseInput: CreateImportedTourInput = {
  id: 'tour-1',
  userId: 'user-1',
  actName: 'The Band',
  actId: 'act-1',
  tourTitle: 'Summer Tour',
  stops: [],
};

describe('createImportedTour', () => {
  it('commits the whole import via a single RPC using the supplied ids and min/max dates', async () => {
    mockResolve
      .mockResolvedValueOnce(bookedResult('venue-1'))
      .mockResolvedValueOnce(inlineResult('Reno'));
    mockRpc.mockResolvedValue({ data: 'tour-1', error: null });

    const result = await createImportedTour({
      ...baseInput,
      stops: [
        {
          // Out-of-order dates confirm start/end are min/max, not first/last.
          id: 'show-a',
          date: '2024-06-05',
          venueName: 'The Fillmore',
          city: 'San Francisco',
          confidence: 'confirmed',
          latitude: 37.7,
          longitude: -122.4,
          venueId: 'venue-1',
        },
        {
          id: 'show-b',
          date: '2024-06-01',
          venueName: '',
          city: 'Reno',
          confidence: 'confirmed',
          latitude: 39.5,
          longitude: -119.8,
        },
      ],
    });

    // One atomic call — not one insert per stop.
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('create_imported_tour', {
      p_tour_id: 'tour-1',
      p_act_id: 'act-1',
      p_act_name: 'The Band',
      p_title: 'Summer Tour',
      p_start_date: '2024-06-01',
      p_end_date: '2024-06-05',
      p_visibility: null,
      p_role: null,
      p_stops: [
        {
          id: 'show-a',
          date: '2024-06-05',
          kind: 'show',
          venue_id: 'venue-1',
          city: null,
          country: null,
          latitude: null,
          longitude: null,
          address: null,
        },
        {
          id: 'show-b',
          date: '2024-06-01',
          kind: 'show',
          venue_id: null,
          city: 'Reno',
          country: 'United States',
          latitude: 39.5,
          longitude: -119.8,
          address: null,
        },
      ],
    });

    expect(result).toEqual({ id: 'tour-1', created: 2 });
  });

  it('re-invoking with the same variables re-sends identical stable ids (idempotent replay)', async () => {
    const input: CreateImportedTourInput = {
      ...baseInput,
      id: 'tour-stable',
      stops: [
        {
          id: 'show-stable',
          date: '2024-06-01',
          venueName: '',
          city: 'Reno',
          confidence: 'confirmed',
          latitude: 39.5,
          longitude: -119.8,
        },
      ],
    };
    mockResolve.mockResolvedValue(inlineResult('Reno'));
    mockRpc.mockResolvedValue({ data: 'tour-stable', error: null });

    // Two invocations with the SAME variables object (a retry / re-tap).
    await createImportedTour(input);
    await createImportedTour(input);

    const first = mockRpc.mock.calls[0][1];
    const second = mockRpc.mock.calls[1][1];

    // No fresh ids are minted between attempts — the RPC dedupes on these, so it converges to one
    // tour + one show rather than duplicating.
    expect(second.p_tour_id).toBe(first.p_tour_id);
    expect(second.p_tour_id).toBe('tour-stable');
    expect(second.p_stops.map((s: { id: string }) => s.id)).toEqual(
      first.p_stops.map((s: { id: string }) => s.id),
    );
    expect(second.p_stops[0].id).toBe('show-stable');
  });

  it('passes each reviewed stop through resolveShowLocation (venue resolution stays client-side)', async () => {
    mockResolve.mockResolvedValueOnce(bookedResult('venue-9'));

    await createImportedTour({
      ...baseInput,
      stops: [
        {
          id: 'show-rr',
          date: '2024-07-01',
          venueName: 'Red Rocks',
          city: 'Morrison',
          confidence: 'confirmed',
          latitude: 39.6,
          longitude: -105.2,
          venueId: 'venue-9',
        },
      ],
    });

    expect(mockResolve).toHaveBeenCalledTimes(1);
    expect(mockResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        venueName: 'Red Rocks',
        venueId: 'venue-9',
        venueCity: 'Morrison',
      }),
    );
  });

  it('re-resolves stops that were not confidently matched during review (safety net)', async () => {
    mockCatalog.mockResolvedValue(null);
    mockGeocode.mockResolvedValue(null);
    mockResolve.mockResolvedValueOnce(inlineResult('Austin'));

    await createImportedTour({
      ...baseInput,
      stops: [{ id: 'show-mystery', date: '2024-08-01', venueName: 'Mystery Club', city: 'Austin' }],
    });

    // No confirmed coords -> resolveImportStop runs, consulting the catalog + geocoder.
    expect(mockCatalog).toHaveBeenCalledWith('Mystery Club', 'Austin');
    expect(mockGeocode).toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('returns the supplied tour id when the RPC returns no data', async () => {
    mockResolve.mockResolvedValueOnce(inlineResult('Reno'));
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await createImportedTour({
      ...baseInput,
      id: 'tour-x',
      stops: [
        { id: 'show-x', date: '2024-06-01', venueName: '', city: 'Reno', confidence: 'confirmed', latitude: 39.5, longitude: -119.8 },
      ],
    });

    expect(result).toEqual({ id: 'tour-x', created: 1 });
  });

  it('throws when the RPC returns an error', async () => {
    mockResolve.mockResolvedValueOnce(bookedResult('venue-1'));
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(
      createImportedTour({
        ...baseInput,
        stops: [
          {
            id: 'show-err',
            date: '2024-06-01',
            venueName: 'The Fillmore',
            city: 'SF',
            confidence: 'confirmed',
            latitude: 37.7,
            longitude: -122.4,
            venueId: 'venue-1',
          },
        ],
      }),
    ).rejects.toEqual({ message: 'boom' });
  });
});
