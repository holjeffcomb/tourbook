import type { TourStop } from '@/features/shows/api';
import {
  applyOffDayUpdate,
  applyShowUpdate,
  insertStop,
  mapStop,
  offDayVarsToStop,
  removeStop,
  showVarsToStop,
} from '@/features/shows/optimistic';

function stop(id: string, date: string, extra: Partial<TourStop> = {}): TourStop {
  return {
    id,
    date,
    kind: 'show',
    created_at: `${date}T00:00:00.000Z`,
    created_by: 'user-1',
    label: null,
    venueId: null,
    location: null,
    ...extra,
  };
}

describe('insertStop', () => {
  it('inserts into an empty/undefined list', () => {
    expect(insertStop(undefined, stop('a', '2026-01-02'))).toHaveLength(1);
  });

  it('keeps the list sorted by date ascending', () => {
    const list = [stop('a', '2026-01-05'), stop('b', '2026-01-10')];
    const next = insertStop(list, stop('c', '2026-01-07'));
    expect(next.map((s) => s.id)).toEqual(['a', 'c', 'b']);
  });

  it('replaces an existing stop with the same id (idempotent replay)', () => {
    const list = [stop('a', '2026-01-05', { label: 'old' })];
    const next = insertStop(list, stop('a', '2026-01-05', { label: 'new' }));
    expect(next).toHaveLength(1);
    expect(next[0].label).toBe('new');
  });
});

describe('removeStop', () => {
  it('removes the matching id and tolerates an undefined list', () => {
    const list = [stop('a', '2026-01-05'), stop('b', '2026-01-10')];
    expect(removeStop(list, 'a').map((s) => s.id)).toEqual(['b']);
    expect(removeStop(undefined, 'a')).toEqual([]);
  });
});

describe('offDayVarsToStop', () => {
  it('builds an off-day stop with no pin (geocoding deferred to sync)', () => {
    const s = offDayVarsToStop({
      id: 'off-1',
      userId: 'user-1',
      tourId: 'tour-1',
      date: '2026-03-01',
      city: 'Berlin',
      label: 'Hotel',
    });
    expect(s.kind).toBe('off');
    expect(s.id).toBe('off-1');
    expect(s.location).not.toBeNull();
    expect(s.location?.latitude).toBeNull();
    expect(s.location?.longitude).toBeNull();
    expect(s.location?.name).toBe('Hotel');
  });

  it('has no location when there is nothing to place', () => {
    const s = offDayVarsToStop({
      id: 'off-2',
      userId: 'user-1',
      tourId: 'tour-1',
      date: '2026-03-02',
    });
    expect(s.location).toBeNull();
  });
});

describe('showVarsToStop', () => {
  it('marks a named venue as booked', () => {
    const s = showVarsToStop({
      id: 'show-1',
      userId: 'user-1',
      tourId: 'tour-1',
      date: '2026-04-01',
      venueName: 'The Fillmore',
      venueCity: 'San Francisco',
    });
    expect(s.kind).toBe('show');
    expect(s.location?.booked).toBe(true);
    expect(s.location?.name).toBe('The Fillmore');
  });

  it('shows "Venue TBD" for a city-only show', () => {
    const s = showVarsToStop({
      id: 'show-2',
      userId: 'user-1',
      tourId: 'tour-1',
      date: '2026-04-02',
      venueCity: 'Austin',
    });
    expect(s.location?.booked).toBe(false);
    expect(s.location?.name).toBe('Venue TBD');
  });
});

describe('mapStop + apply*Update', () => {
  const showStop: TourStop = {
    id: 's1',
    date: '2026-04-01',
    kind: 'show',
    created_at: '2026-04-01T00:00:00Z',
    created_by: 'user-1',
    label: null,
    venueId: 'v1',
    location: { name: 'Old', city: 'A', country: 'US', address: null, latitude: 1, longitude: 2, booked: true },
  };

  it('applyShowUpdate replaces the venue and preserves country', () => {
    const next = applyShowUpdate(showStop, {
      userId: 'user-1',
      showId: 's1',
      date: '2026-04-03',
      venueName: 'New Venue',
      venueCity: 'B',
    });
    expect(next.date).toBe('2026-04-03');
    expect(next.location?.name).toBe('New Venue');
    expect(next.location?.country).toBe('US');
  });

  it('applyOffDayUpdate clears location when nothing is provided', () => {
    const offStop: TourStop = { ...showStop, kind: 'off', label: 'Hotel' };
    const next = applyOffDayUpdate(offStop, {
      userId: 'user-1',
      stopId: 's1',
      date: '2026-04-05',
    });
    expect(next.label).toBeNull();
    expect(next.location).toBeNull();
  });

  it('mapStop re-sorts when a date changes', () => {
    const list: TourStop[] = [
      showStop,
      { ...showStop, id: 's2', date: '2026-04-10' },
    ];
    const next = mapStop(list, 's1', (s) => ({ ...s, date: '2026-04-20' }));
    expect(next.map((s) => s.id)).toEqual(['s2', 's1']);
  });
});
