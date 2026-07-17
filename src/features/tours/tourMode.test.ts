import type { TourStop } from '@/features/shows/api';
import type { MyTour } from '@/features/tours/api';
import { isTourActiveOn, pickActiveTour, pickCurrentStop } from '@/features/tours/tourMode';

function tour(overrides: Partial<MyTour>): MyTour {
  return {
    id: 'tour-1',
    title: null,
    start_date: null,
    end_date: null,
    visibility: 'private',
    created_at: '2024-01-01T00:00:00Z',
    created_by: 'user-1',
    act: { id: 'act-1', name: 'The Act' },
    myRole: null,
    ...overrides,
  };
}

function stop(overrides: Partial<TourStop>): TourStop {
  return {
    id: 'stop-1',
    date: '2024-06-01',
    kind: 'show',
    created_at: '2024-01-01T00:00:00Z',
    created_by: 'user-1',
    label: null,
    venueId: 'venue-1',
    location: {
      name: 'The Venue',
      city: 'Austin',
      country: 'United States',
      address: null,
      latitude: 30.27,
      longitude: -97.74,
      booked: true,
    },
    ...overrides,
  };
}

describe('isTourActiveOn', () => {
  it('is active when today is within the inclusive date range', () => {
    const t = tour({ start_date: '2024-06-01', end_date: '2024-06-10' });
    expect(isTourActiveOn(t, '2024-06-01')).toBe(true);
    expect(isTourActiveOn(t, '2024-06-05')).toBe(true);
    expect(isTourActiveOn(t, '2024-06-10')).toBe(true);
  });

  it('is inactive outside the range', () => {
    const t = tour({ start_date: '2024-06-01', end_date: '2024-06-10' });
    expect(isTourActiveOn(t, '2024-05-31')).toBe(false);
    expect(isTourActiveOn(t, '2024-06-11')).toBe(false);
  });

  it('never activates without both a start and end date', () => {
    expect(isTourActiveOn(tour({ start_date: '2024-06-01' }), '2024-06-05')).toBe(false);
    expect(isTourActiveOn(tour({ end_date: '2024-06-10' }), '2024-06-05')).toBe(false);
    expect(isTourActiveOn(tour({}), '2024-06-05')).toBe(false);
  });
});

describe('pickActiveTour', () => {
  it('returns null when no tour contains today', () => {
    const tours = [tour({ start_date: '2024-01-01', end_date: '2024-01-10' })];
    expect(pickActiveTour(tours, '2024-06-05')).toBeNull();
  });

  it('prefers the active tour ending soonest when tours overlap', () => {
    const endsLater = tour({ id: 'later', start_date: '2024-06-01', end_date: '2024-06-30' });
    const endsSooner = tour({ id: 'sooner', start_date: '2024-06-01', end_date: '2024-06-07' });
    expect(pickActiveTour([endsLater, endsSooner], '2024-06-05')?.id).toBe('sooner');
  });
});

describe('pickCurrentStop', () => {
  it("prefers today's show over other stops", () => {
    const stops = [
      stop({ id: 'yesterday', date: '2024-06-04' }),
      stop({ id: 'today', date: '2024-06-05' }),
      stop({ id: 'tomorrow', date: '2024-06-06' }),
    ];
    expect(pickCurrentStop(stops, '2024-06-05')?.stop.id).toBe('today');
  });

  it('falls back to the next upcoming located stop', () => {
    const stops = [
      stop({ id: 'past', date: '2024-06-01' }),
      stop({ id: 'future', date: '2024-06-09' }),
    ];
    expect(pickCurrentStop(stops, '2024-06-05')?.stop.id).toBe('future');
  });

  it('falls back to the most recent stop when all are in the past', () => {
    const stops = [
      stop({ id: 'early', date: '2024-06-01' }),
      stop({ id: 'late', date: '2024-06-03' }),
    ];
    expect(pickCurrentStop(stops, '2024-06-05')?.stop.id).toBe('late');
  });

  it('ignores stops without coordinates', () => {
    const stops = [
      stop({ id: 'no-coords', date: '2024-06-05', location: null }),
      stop({ id: 'located', date: '2024-06-08' }),
    ];
    expect(pickCurrentStop(stops, '2024-06-05')?.stop.id).toBe('located');
  });

  it('returns null when nothing is located', () => {
    expect(pickCurrentStop([stop({ location: null })], '2024-06-05')).toBeNull();
  });
});
